"""ClusteringService — tach tu app.py (giu nguyen hanh vi).

Embedding + clustering (DBSCAN/KMeans) cho DataPrep:
visualize / cluster / filter_remove_noise / filter_deduplicate / safe_split.
"""
import os
import json
import hashlib
import numpy as np
import torch
from collections import defaultdict
from sklearn.cluster import DBSCAN, KMeans
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors
from sentence_transformers import SentenceTransformer


class ClusteringService:
    """
    Singleton giữ model + embedding cache dùng chung cho Visualize và Cluster.

    Cache lifecycle:
        visualize()           → _embed_cache   lưu conv_embeddings + raw data
        cluster()             → _cluster_cache lưu kết quả DBSCAN + KMeans
        filter_remove_noise() → đọc _cluster_cache, không ghi cache
        filter_deduplicate()  → đọc _cluster_cache, không ghi cache
        clear_cache()         → xóa toàn bộ cache
    """

    def __init__(self):
        # Data Prep embeddings must not permanently reserve inference VRAM.
        # Set CLUSTER_DEVICE=cuda explicitly only when GPU clustering is needed.
        requested_device = os.environ.get("CLUSTER_DEVICE", "cpu").strip().lower()
        self.device = "cuda" if requested_device == "cuda" and torch.cuda.is_available() else "cpu"
        print(f"[ClusteringService] Loading model on {self.device}...")
        self.model = SentenceTransformer("intfloat/multilingual-e5-base", device=self.device)
        self.model.max_seq_length = 512
        print("[ClusteringService] Model ready.")

        # ── Embedding cache (set bởi visualize, đọc bởi cluster) ──
        self._embed_cache: dict | None = None

        # ── Cluster cache (set bởi cluster, đọc bởi filter_*) ──
        self._cluster_cache: dict | None = None

    # ──────────────────────────────────────────────────────────────────────────
    # Cache helpers
    # ──────────────────────────────────────────────────────────────────────────

    # def _save_embed_cache(self, data: list[dict], conv_embeddings: np.ndarray,
    #                       conv_to_pair_indices: list[list[int]]):
    #     self._embed_cache = {
    #         "data":                 data,
    #         "conv_embeddings":      conv_embeddings,      # (N, 768) L2-normalized
    #         "conv_to_pair_indices": conv_to_pair_indices,
    #     }
    #     print(f"[EmbedCache] Saved {len(data)} conversations.")


    def _save_embed_cache(
        self,
        data: list[dict],
        conv_embeddings: np.ndarray,
        conv_to_pair_indices: list[list[int]],
        dataset_fingerprint: str,
    ):
        self._embed_cache = {
            "data":                 data,
            "conv_embeddings":      conv_embeddings,
            "conv_to_pair_indices": conv_to_pair_indices,
            "dataset_fingerprint":  dataset_fingerprint,
        }
        print(f"[EmbedCache] Saved {len(data)} conversations. fingerprint={dataset_fingerprint[:12]}")


    def _load_embed_cache(self) -> dict:
        if self._embed_cache is None:
            raise RuntimeError(
                "Chưa có embedding cache. Hãy gọi POST /api/cluster/visualize trước."
            )
        return self._embed_cache

    def _save_cluster_cache(self, data: list[dict], conv_embeddings: np.ndarray,
                             assignments: list[int], clean_indices: list[int],
                             final_labels: np.ndarray, centroids: np.ndarray,
                             similarities: np.ndarray):
        self._cluster_cache = {
            "data":             data,
            "conv_embeddings":  conv_embeddings,
            "assignments":      assignments,    # -1 = noise, 0..K-1 = cụm KMeans
            "clean_indices":    clean_indices,  # index trong data[] sau lọc noise
            "final_labels":     final_labels,   # nhãn KMeans, shape (len(clean_indices),)
            "centroids":        centroids,       # shape (K, dim), đã L2-normalize
            "similarities":     similarities,   # cosine sim mỗi điểm clean vs tâm cụm, shape (M,)
        }
        print(f"[ClusterCache] Saved. Total: {len(data)} | "
              f"Clean: {len(clean_indices)} | Noise: {len(data) - len(clean_indices)}")

    def _load_cluster_cache(self) -> dict:
        if self._cluster_cache is None:
            raise RuntimeError(
                "Chưa có cluster cache. Hãy gọi POST /api/cluster trước."
            )
        return self._cluster_cache

    def clear_cache(self):
        """Xóa toàn bộ cache (embed + cluster)."""
        self._embed_cache   = None
        self._cluster_cache = None
        print("[Cache] Cleared.")



    #########

    def _normalize_record_for_fingerprint(self, item: dict) -> dict:
        if "messages" in item and isinstance(item.get("messages"), list):
            return {
                "messages": [
                    {
                        "role": str(msg.get("role", "")),
                        "content": str(msg.get("content", "")),
                    }
                    for msg in item.get("messages", [])
                ]
            }

        return {
            "instruction": str(item.get("instruction", item.get("query", ""))),
            "input": str(item.get("input", item.get("context", ""))),
            "output": str(item.get("output", item.get("answer", item.get("response", "")))),
        }


    def _dataset_fingerprint(self, data: list[dict]) -> str:
        normalized = [self._normalize_record_for_fingerprint(item) for item in data]
        raw = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


    def _parse_records_for_embedding(self, data: list[dict]):
        """
        Hỗ trợ cả:
        - OpenAI messages format
        - Alpaca format
        """
        all_pair_texts: list[str] = []
        conv_to_pair_indices: list[list[int]] = []
        count = 0

        for item in data:
            # OpenAI messages format
            if "messages" in item and isinstance(item.get("messages"), list):
                messages = item.get("messages", [])
                pairs: list[str] = []
                i = 0
                while i < len(messages):
                    msg = messages[i]
                    if msg.get("role") == "user":
                        user_content = str(msg.get("content", "")).strip()
                        if i + 1 < len(messages) and messages[i + 1].get("role") == "assistant":
                            assistant_content = str(messages[i + 1].get("content", "")).strip()
                            if user_content and assistant_content:
                                pairs.append(f"user:{user_content} assistant:{assistant_content}")
                            i += 2
                            continue
                    i += 1

                if pairs:
                    indices = []
                    for pair_text in pairs:
                        all_pair_texts.append(pair_text)
                        indices.append(count)
                        count += 1
                    conv_to_pair_indices.append(indices)
                else:
                    conv_to_pair_indices.append([])
                continue

            # Alpaca / lesson-like format
            instruction = str(item.get("instruction", item.get("query", ""))).strip()
            input_text = str(item.get("input", item.get("context", ""))).strip()
            output = str(item.get("output", item.get("answer", item.get("response", "")))).strip()

            user_text = "\n\n".join([part for part in [instruction, input_text] if part])
            if user_text and output:
                all_pair_texts.append(f"user:{user_text} assistant:{output}")
                conv_to_pair_indices.append([count])
                count += 1
            else:
                conv_to_pair_indices.append([])

        return all_pair_texts, conv_to_pair_indices


    def _ensure_embeddings(self, data: list[dict]) -> tuple[np.ndarray, str]:
        dataset_fingerprint = self._dataset_fingerprint(data)

        if (
            self._embed_cache is not None
            and self._embed_cache.get("dataset_fingerprint") == dataset_fingerprint
        ):
            print(f"[EmbedCache] Reused {len(data)} items. fingerprint={dataset_fingerprint[:12]}")
            return self._embed_cache["conv_embeddings"], dataset_fingerprint

        print("1. Parsing records for embedding...")
        all_pair_texts, conv_to_pair_indices = self._parse_records_for_embedding(data)
        if not all_pair_texts:
            raise ValueError("Không trích xuất được cặp nội dung hợp lệ để embedding.")

        print(f"2. Embedding {len(all_pair_texts)} pair-texts...")
        utt_embeddings = self._embed(all_pair_texts)

        print("3. Mean pooling + L2 normalize...")
        conv_embeddings = self._mean_pool_and_normalize(utt_embeddings, conv_to_pair_indices)

        self._save_embed_cache(
            data=data,
            conv_embeddings=conv_embeddings,
            conv_to_pair_indices=conv_to_pair_indices,
            dataset_fingerprint=dataset_fingerprint,
        )
        return conv_embeddings, dataset_fingerprint


    def _build_random_split(
        self,
        n: int,
        test_percentage: float,
        rng: np.random.Generator,
    ) -> tuple[list[int], list[int]]:
        if n <= 0:
            return [], []
        if n == 1:
            return [0], []

        safe_percentage = max(1.0, min(50.0, float(test_percentage)))
        test_count = int(round(n * (safe_percentage / 100.0)))
        test_count = max(1, min(n - 1, test_count))

        perm = rng.permutation(n).tolist()
        test_indices = sorted(perm[:test_count])
        train_indices = sorted(perm[test_count:])
        return train_indices, test_indices


    def _measure_cross_split_conflicts(
        self,
        embeddings: np.ndarray,
        train_indices: list[int],
        test_indices: list[int],
        threshold: float,
        preview_limit: int = 10,
    ) -> tuple[int, float, list[dict]]:
        if not train_indices or not test_indices:
            return 0, 0.0, []

        train_embs = embeddings[train_indices]  # (T, D)
        test_embs  = embeddings[test_indices]   # (S, D)

        # embeddings đã L2-normalize -> dot = cosine similarity
        sim_matrix = np.matmul(train_embs, test_embs.T)  # (T, S)

        max_similarity = float(sim_matrix.max()) if sim_matrix.size else 0.0
        conflict_positions = np.argwhere(sim_matrix > threshold)

        conflict_count = int(conflict_positions.shape[0])
        if conflict_count == 0:
            return 0, max_similarity, []

        preview = []
        scored_pairs = []
        for pos in conflict_positions:
            train_pos = int(pos[0])
            test_pos = int(pos[1])
            sim = float(sim_matrix[train_pos, test_pos])
            scored_pairs.append((sim, train_indices[train_pos], test_indices[test_pos]))

        scored_pairs.sort(key=lambda x: x[0], reverse=True)
        for sim, train_idx, test_idx in scored_pairs[:preview_limit]:
            preview.append({
                "trainIndex": train_idx,
                "testIndex": test_idx,
                "similarity": round(sim, 6),
            })

        return conflict_count, max_similarity, preview


    #########

    def safe_split(
        self,
        data: list[dict],
        test_percentage: float = 20,
        threshold: float = 0.85,
        max_attempts: int = 20,
        seed: int = 42,
    ) -> dict:
        """
        Sinh split train/test sao cho semantic conflict giữa 2 tập <= threshold.
        GPU service tự embed, tự đo similarity, tự auto re-split.

        Returns:
            {
                "resolved": bool,
                "attempts": int,
                "threshold": float,
                "trainIndices": list[int],
                "testIndices": list[int],
                "trainCount": int,
                "testCount": int,
                "conflictCount": int,
                "maxCrossSplitSimilarity": float,
                "datasetFingerprint": str,
                "conflictsPreview": list[dict]
            }
        """
        print("=== [SafeSplit] Bắt đầu ===")
        if not data:
            raise ValueError("data rỗng")

        conv_embeddings, dataset_fingerprint = self._ensure_embeddings(data)
        n = len(data)

        if n == 1:
            print("=== [SafeSplit] Chỉ có 1 mẫu, bỏ qua semantic split ===")
            return {
                "resolved": True,
                "attempts": 1,
                "threshold": float(threshold),
                "trainIndices": [0],
                "testIndices": [],
                "trainCount": 1,
                "testCount": 0,
                "conflictCount": 0,
                "maxCrossSplitSimilarity": 0.0,
                "datasetFingerprint": dataset_fingerprint,
                "conflictsPreview": [],
            }

        rng = np.random.default_rng(seed)
        safe_threshold = float(max(0.0, min(1.0, threshold)))
        safe_attempts = max(1, int(max_attempts))

        best_result = None

        for attempt in range(1, safe_attempts + 1):
            train_indices, test_indices = self._build_random_split(
                n=n,
                test_percentage=test_percentage,
                rng=rng,
            )

            conflict_count, max_similarity, conflicts_preview = self._measure_cross_split_conflicts(
                embeddings=conv_embeddings,
                train_indices=train_indices,
                test_indices=test_indices,
                threshold=safe_threshold,
                preview_limit=10,
            )

            current = {
                "resolved": conflict_count == 0,
                "attempts": attempt,
                "threshold": safe_threshold,
                "trainIndices": train_indices,
                "testIndices": test_indices,
                "trainCount": len(train_indices),
                "testCount": len(test_indices),
                "conflictCount": conflict_count,
                "maxCrossSplitSimilarity": round(max_similarity, 6),
                "datasetFingerprint": dataset_fingerprint,
                "conflictsPreview": conflicts_preview,
            }

            print(
                f"[SafeSplit] attempt={attempt} "
                f"train={len(train_indices)} test={len(test_indices)} "
                f"conflicts={conflict_count} max_sim={max_similarity:.4f}"
            )

            if best_result is None:
                best_result = current
            else:
                if current["conflictCount"] < best_result["conflictCount"]:
                    best_result = current
                elif (
                    current["conflictCount"] == best_result["conflictCount"]
                    and current["maxCrossSplitSimilarity"] < best_result["maxCrossSplitSimilarity"]
                ):
                    best_result = current

            if current["resolved"]:
                print("=== [SafeSplit] Hoàn tất: RESOLVED ===")
                return current

        print("=== [SafeSplit] Hoàn tất: UNRESOLVED ===")
        return best_result


    # ──────────────────────────────────────────────────────────────────────────
    # Embedding helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _parse_conversations(self, data: list[dict]):
        """
        Mỗi cặp (user, assistant) liền kề → 1 text "user:{…} assistant:{…}" → 1 vector.
        Mean pool các vector trong conversation → 1 vector đại diện.
        Conversation không có cặp hợp lệ → vector zero → DBSCAN đánh noise.
        """
        all_pair_texts: list[str]        = []
        conv_to_pair_indices: list[list] = []
        count = 0

        for conv in data:
            messages = conv.get("messages", [])
            pairs: list[str] = []
            i = 0
            while i < len(messages):
                msg = messages[i]
                if msg.get("role") == "user":
                    user_content = msg.get("content", "").strip()
                    if (i + 1 < len(messages)
                            and messages[i + 1].get("role") == "assistant"):
                        assistant_content = messages[i + 1].get("content", "").strip()
                        if user_content and assistant_content:
                            pairs.append(
                                f"user:{user_content} assistant:{assistant_content}"
                            )
                        i += 2
                        continue
                i += 1

            if pairs:
                indices = []
                for pair_text in pairs:
                    all_pair_texts.append(pair_text)
                    indices.append(count)
                    count += 1
                conv_to_pair_indices.append(indices)
            else:
                conv_to_pair_indices.append([])

        return all_pair_texts, conv_to_pair_indices

    def _embed_long_text(self, text: str, chunk_size: int = 400,
                         overlap: int = 50) -> np.ndarray:
        """Late-chunking cho text dài: chunk có overlap → weighted mean pool."""
        words = text.split()
        if len(words) <= chunk_size:
            result = self.model.encode(
                ["query: " + text],
                normalize_embeddings=False,
                device=self.device,
            )
            return result[0].astype(np.float32)

        chunks, start = [], 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunks.append(" ".join(words[start:end]))
            if end == len(words):
                break
            start += chunk_size - overlap

        prefixed = ["query: " + c for c in chunks]
        chunk_embs = self.model.encode(
            prefixed, normalize_embeddings=False,
            batch_size=8, device=self.device,
        ).astype(np.float32)

        weights = np.array([len(c.split()) for c in chunks], dtype=np.float32)
        weights /= weights.sum()
        return np.sum(chunk_embs * weights[:, np.newaxis], axis=0)

    def _embed(self, utterances: list[str]) -> np.ndarray:
        """Batch encode text ngắn + late-chunking cho text dài."""
        TOKEN_LIMIT_WORDS = 350
        dim = self.model.get_sentence_embedding_dimension()
        embeddings = np.zeros((len(utterances), dim), dtype=np.float32)

        short_idx = [i for i, u in enumerate(utterances)
                     if len(u.split()) <= TOKEN_LIMIT_WORDS]
        long_idx  = [i for i, u in enumerate(utterances)
                     if len(u.split()) >  TOKEN_LIMIT_WORDS]

        if short_idx:
            pairs = [("query: " + utterances[i], i)
                     for i in short_idx if utterances[i].strip()]
            if pairs:
                texts_list, orig_indices = zip(*pairs)
                vecs = self.model.encode(
                    list(texts_list),
                    show_progress_bar=True,
                    normalize_embeddings=False,
                    batch_size=32,
                    device=self.device,
                ).astype(np.float32)
                for pos, orig_i in enumerate(orig_indices):
                    embeddings[orig_i] = vecs[pos]

        if long_idx:
            print(f"   -> {len(long_idx)} text dài → late chunking...")
            for orig_i in long_idx:
                embeddings[orig_i] = self._embed_long_text(utterances[orig_i])

        return embeddings

    def _mean_pool_and_normalize(self, utt_embeddings: np.ndarray,
                                  conv_to_utt_indices: list) -> np.ndarray:
        dim = utt_embeddings.shape[1]
        conv_embs = []
        for indices in conv_to_utt_indices:
            if not indices:
                conv_embs.append(np.zeros(dim, dtype=np.float32))
            else:
                conv_embs.append(np.mean(utt_embeddings[indices], axis=0))
        conv_embs = np.array(conv_embs, dtype=np.float32)
        norms = np.linalg.norm(conv_embs, axis=1, keepdims=True)
        norms[norms == 0] = 1e-10
        return conv_embs / norms

    # ──────────────────────────────────────────────────────────────────────────
    # Output helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _normalize_centroids(self, centroids: np.ndarray) -> np.ndarray:
        c = centroids.astype(np.float32)
        norms = np.linalg.norm(c, axis=1, keepdims=True)
        norms[norms == 0] = 1e-10
        return c / norms

    def _compute_similarities(self, conv_embeddings: np.ndarray,
                               clean_indices: list[int],
                               final_labels: np.ndarray,
                               centroids: np.ndarray) -> np.ndarray:
        """
        Tính cosine similarity giữa mỗi điểm clean và tâm cụm được gán.

        conv_embeddings và centroids đều đã L2-normalize
        → dot product = cosine similarity.

        Returns:
            similarities: np.ndarray shape (M,), dtype float32
                          M = len(clean_indices)
        """
        clean_embs         = conv_embeddings[clean_indices]   # (M, dim)
        assigned_centroids = centroids[final_labels]          # (M, dim)
        return np.sum(clean_embs * assigned_centroids, axis=1).astype(np.float32)

    def _make_label(self, cluster_id: int) -> str:
        return f"Cụm {cluster_id}"

    def _build_output(self, data: list, assignments: list) -> dict:
        result_data = [{**item, "cluster": assignments[i]}
                       for i, item in enumerate(data)]
        count_map: dict = defaultdict(int)
        for cid in assignments:
            count_map[cid] += 1
        groups = [
            {
                "groupId": cid,
                "count":   count_map[cid],
                "label":   "Nhiễu" if cid == -1 else self._make_label(cid),
            }
            for cid in sorted(count_map.keys())
        ]
        return {"data": result_data, "assignments": assignments, "groups": groups}

    # ──────────────────────────────────────────────────────────────────────────
    # Step 3 — Visualize
    # ──────────────────────────────────────────────────────────────────────────


    # ─────────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────────────────────

    def _compute_elbow(self, embeddings: np.ndarray, max_k: int) -> list[dict]:
        """
        Tính WCSS (Within-Cluster Sum of Squares) cho k = 1..max_k.

        Args:
            embeddings: L2-normalized numpy array, shape (N, D).
            max_k:      Giá trị k lớn nhất cần thử.

        Returns:
            List of {"k": int, "wcss": float}, sorted by k ascending.
        """
        limit_k = min(max_k, len(embeddings))
        results = []
        for k in range(1, limit_k + 1):
            km = KMeans(n_clusters=k, random_state=42, n_init="auto")
            km.fit(embeddings)
            results.append({"k": k, "wcss": float(km.inertia_)})
        return results


    def _compute_silhouette(
        self, embeddings: np.ndarray, max_k: int
    ) -> list[dict]:
        """
        Tính Silhouette Score cho k = 2..max_k.
        Silhouette không xác định với k=1 nên bắt đầu từ k=2.

        Args:
            embeddings: L2-normalized numpy array, shape (N, D).
            max_k:      Giá trị k lớn nhất cần thử.

        Returns:
            List of {"k": int, "silhouette": float}, sorted by k ascending.
            Giá trị nằm trong [-1, 1]; càng cao càng tốt.
        """
        # Cần ít nhất 2 cluster và 3 điểm (sklearn yêu cầu n_samples > n_clusters)
        limit_k = min(max_k, len(embeddings) - 1)
        if limit_k < 2:
            return []

        results = []
        for k in range(2, limit_k + 1):
            km = KMeans(n_clusters=k, random_state=42, n_init="auto")
            labels = km.fit_predict(embeddings)
            # Chỉ tính khi có ít nhất 2 cluster thực sự xuất hiện
            if len(set(labels)) < 2:
                continue
            score = silhouette_score(embeddings, labels, metric="euclidean")
            results.append({"k": k, "silhouette": float(score)})
        return results


    # ─────────────────────────────────────────────────────────────────────────────
    # Public method
    # ─────────────────────────────────────────────────────────────────────────────

    def visualize(
        self,
        data: list[dict],
        max_k: int,
        eps: float,
        min_samples: int,
    ) -> dict:
        """
        Embed toàn bộ data, lưu conv_embeddings vào _embed_cache,
        rồi tính Elbow + Silhouette + K-Distance dựa trên tập đã lọc noise.

        Args:
            data:        Danh sách conversation dict.
            max_k:       Số cluster tối đa cần khảo sát.
            eps:         Tham số epsilon cho DBSCAN (ngưỡng khoảng cách).
            min_samples: Số điểm tối thiểu trong vùng lân cận cho DBSCAN.

        Returns:
            {
                "elbow":      [{"k": int, "wcss": float}, ...],
                "silhouette": [{"k": int, "silhouette": float}, ...],
                "kDistance":  [{"rank": int, "distance": float}, ...],
                "pointCount": int,   # số điểm sạch (sau khi lọc noise)
                "noiseCount": int,   # số điểm bị DBSCAN đánh dấu noise
            }
        """
        print("=== [Visualize] Bắt đầu ===")

        # # ── 1. Parse & embed ──────────────────────────────────────────────────
        # print("1. Parsing conversations...")
        # all_pair_texts, conv_to_pair_indices = self._parse_conversations(data)
        # if not all_pair_texts:
        #     raise ValueError(
        #         "Không trích xuất được cặp (user, assistant) nào từ data."
        #     )

        # print(f"2. Embedding {len(all_pair_texts)} pair-texts...")
        # utt_embeddings = self._embed(all_pair_texts)

        # print("3. Mean pooling + L2 normalize...")
        # conv_embeddings = self._mean_pool_and_normalize(
        #     utt_embeddings, conv_to_pair_indices
        # )  # shape (N, 768)

        # # ── 2. Lưu embedding cache để cluster() tái sử dụng ──────────────────
        # self._save_embed_cache(data, conv_embeddings, conv_to_pair_indices)

        # # ── 3. DBSCAN lọc noise ───────────────────────────────────────────────
        # print(f"4. DBSCAN noise filter (eps={eps}, min_samples={min_samples})...")
        # dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
        # db_labels = dbscan.fit_predict(conv_embeddings)

        conv_embeddings, _dataset_fingerprint = self._ensure_embeddings(data)

        print(f"4. DBSCAN noise filter (eps={eps}, min_samples={min_samples})...")
        dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
        db_labels = dbscan.fit_predict(conv_embeddings)

        noise_mask  = db_labels == -1
        noise_count = int(noise_mask.sum())
        clean_embs  = conv_embeddings[~noise_mask]
        point_count = len(clean_embs)
        print(f"   -> Noise: {noise_count} | Clean: {point_count}")

        if point_count == 0:
            raise ValueError(
                "Toàn bộ dữ liệu bị DBSCAN đánh nhãn là noise. "
                "Hãy thử tăng eps hoặc giảm min_samples."
            )

        # ── 4. Elbow Method ───────────────────────────────────────────────────
        print(f"5. Elbow Method (max_k={max_k})...")
        elbow_data = self._compute_elbow(clean_embs, max_k)

        # ── 5. Silhouette Score ───────────────────────────────────────────────
        print(f"6. Silhouette Score (max_k={max_k})...")
        silhouette_data = self._compute_silhouette(clean_embs, max_k)

        # ── 6. K-Distance Graph ───────────────────────────────────────────────
        print(f"7. K-Distance Graph (k={min_samples})...")
        n_neighbors = min(min_samples, point_count - 1)
        k_distance_data = []
        if n_neighbors >= 1:
            nbrs = NearestNeighbors(n_neighbors=n_neighbors, metric="cosine")
            nbrs.fit(clean_embs)
            dists, _ = nbrs.kneighbors(clean_embs)
            kth = np.sort(dists[:, -1])[::-1]
            k_distance_data = [
                {"rank": int(i + 1), "distance": float(d)}
                for i, d in enumerate(kth)
            ]

        print("=== [Visualize] Hoàn tất ===")
        return {
            "elbow":      elbow_data,
            "silhouette": silhouette_data,
            "kDistance":  k_distance_data,
            "pointCount": point_count,
            "noiseCount": noise_count,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Step 4 — Cluster  (DBSCAN + KMeans, lưu _cluster_cache)
    # API: POST /api/cluster
    # ──────────────────────────────────────────────────────────────────────────

    def cluster(self, k: int, eps: float, min_samples: int, data: list[dict] | None = None) -> dict:
        """
        Chạy DBSCAN lọc noise rồi KMeans phân cụm,
        lưu toàn bộ kết quả vào _cluster_cache để filter_* tái sử dụng.

        Nếu có truyền data, tự động _ensure_embeddings(data). 
        Nếu không, đọc từ _embed_cache.

        Returns:
            {
                "data":        list[dict],  # toàn bộ data kèm cluster id
                "assignments": list[int],   # -1 = noise, 0..K-1 = cụm KMeans
                "groups":      list[dict],  # [{groupId, count, label}, ...]
                "clusterStats":    list[dict],  # [{clusterId, avgSimilarity, count}, ...]
                "avgSimilarity":   float,       # trung bình toàn bộ tập clean
            }
        """
        print("=== [Cluster] Bắt đầu ===")
        if data is not None:
            conv_embeddings, _ = self._ensure_embeddings(data)
        else:
            cache = self._load_embed_cache()
            data            = cache["data"]
            conv_embeddings = cache["conv_embeddings"]

        # ── 1. DBSCAN lọc noise ───────────────────────────────────────────────
        print(f"1. DBSCAN (eps={eps}, min_samples={min_samples})...")
        dbscan = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
        dbscan_labels = dbscan.fit_predict(conv_embeddings)

        clean_indices = [i for i, lbl in enumerate(dbscan_labels) if lbl != -1]
        noise_count   = len(dbscan_labels) - len(clean_indices)
        print(f"   -> Nhiễu: {noise_count} | Sạch: {len(clean_indices)}")

        if not clean_indices:
            raise ValueError(
                "Toàn bộ dữ liệu bị DBSCAN đánh nhãn là noise. "
                "Hãy thử tăng eps hoặc giảm min_samples."
            )

        # ── 2. KMeans phân cụm trên tập clean ────────────────────────────────
        num_clusters = max(1, min(k, len(clean_indices)))
        print(f"2. KMeans (K={num_clusters}) trên {len(clean_indices)} điểm sạch...")
        kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init="auto")
        final_labels = kmeans.fit_predict(conv_embeddings[clean_indices])
        centroids    = self._normalize_centroids(kmeans.cluster_centers_)

        # ── 3. Ghép nhãn KMeans vào assignments (giữ -1 cho noise) ──────────
        assignments = [-1] * len(data)
        for pos, orig_idx in enumerate(clean_indices):
            assignments[orig_idx] = int(final_labels[pos])

        # ── 4. Tính cosine similarity mỗi điểm clean vs tâm cụm ──────────────
        final_labels_arr = np.array(final_labels, dtype=np.int32)
        similarities = self._compute_similarities(
            conv_embeddings, clean_indices, final_labels_arr, centroids
        )

        # ── 5. Tổng hợp avg similarity theo từng cụm + toàn bộ tập clean ─────
        cluster_sim_sum   = defaultdict(float)
        cluster_sim_count = defaultdict(int)
        for pos, cid in enumerate(final_labels_arr):
            cluster_sim_sum[int(cid)]   += float(similarities[pos])
            cluster_sim_count[int(cid)] += 1

        cluster_stats = [
            {
                "clusterId":     cid,
                "avgSimilarity": round(cluster_sim_sum[cid] / cluster_sim_count[cid], 4),
                "count":         cluster_sim_count[cid],
            }
            for cid in sorted(cluster_sim_sum.keys())
        ]
        overall_avg_similarity = round(float(similarities.mean()), 4)

        self._save_cluster_cache(
            data=data,
            conv_embeddings=conv_embeddings,
            assignments=assignments,
            clean_indices=clean_indices,
            final_labels=final_labels_arr,
            centroids=centroids,
            similarities=similarities,
        )

        print("=== [Cluster] Hoàn tất ===")
        output = self._build_output(data, assignments)
        output["clusterStats"]  = cluster_stats
        output["avgSimilarity"] = overall_avg_similarity
        return output

    # ──────────────────────────────────────────────────────────────────────────
    # Step 5a — Filter: Remove Noise
    # API: POST /api/cluster/filter/remove-noise
    # ──────────────────────────────────────────────────────────────────────────

    def filter_remove_noise(self) -> dict:
        """
        Đọc _cluster_cache, loại bỏ tất cả điểm có cluster == -1 (noise DBSCAN).
        Trả về phần còn lại với nhãn cụm KMeans nguyên vẹn.

        Phải gọi cluster() trước.
        Hoạt động độc lập với filter_deduplicate().

        Returns:
            {
                "data":         list[dict],
                "assignments":  list[int],   # chỉ còn 0..K-1
                "groups":       list[dict],
                "removedCount": int,          # số điểm noise bị loại
                "keptCount":    int           # số điểm còn lại
            }
        """
        print("=== [FilterRemoveNoise] Bắt đầu ===")
        cache       = self._load_cluster_cache()
        data        = cache["data"]
        assignments = cache["assignments"]

        kept_data, kept_assignments = [], []
        removed_count = 0

        for i, item in enumerate(data):
            if assignments[i] == -1:
                removed_count += 1
            else:
                kept_data.append(item)
                kept_assignments.append(assignments[i])

        print(f"   -> Loại bỏ noise: {removed_count} | Giữ lại: {len(kept_data)}")
        print("=== [FilterRemoveNoise] Hoàn tất ===")

        output = self._build_output(kept_data, kept_assignments)
        output["removedCount"] = removed_count
        output["keptCount"]    = len(kept_data)
        return output

    # ──────────────────────────────────────────────────────────────────────────
    # Step 5b — Filter: Deduplicate
    # API: POST /api/cluster/filter/deduplicate
    # ──────────────────────────────────────────────────────────────────────────

    def filter_deduplicate(self, threshold: float = 0.9) -> dict:
        """
        Đọc _cluster_cache, loại bỏ các điểm có cosine similarity với tâm
        cụm > threshold (quá giống nhau / trùng lặp). Điểm noise bỏ qua.
        Luôn giữ lại đúng 1 điểm gần tâm nhất của mỗi cụm.

        Phải gọi cluster() trước.
        Hoạt động độc lập với filter_remove_noise().

        Cosine similarity = dot(e, c) vì conv_embeddings và centroids
        đều đã L2-normalized → cosine_distance = 1 - similarity.

        Returns:
            {
                "data":         list[dict],
                "assignments":  list[int],
                "groups":       list[dict],
                "removedCount": int,          # số điểm bị loại do quá gần tâm
                "keptCount":    int           # số điểm còn lại
            }
        """
        print(f"=== [FilterDeduplicate] threshold={threshold} ===")
        cache           = self._load_cluster_cache()
        data            = cache["data"]
        conv_embeddings = cache["conv_embeddings"]
        assignments     = cache["assignments"]
        clean_indices   = cache["clean_indices"]
        final_labels    = cache["final_labels"]
        centroids       = cache["centroids"]

        # ── Đọc similarities từ cache (đã tính sẵn bởi cluster()) ────────────
        similarities = cache["similarities"]

        # ── Điểm gần tâm nhất mỗi cụm → bắt buộc giữ lại ────────────────────
        centroid_reps: dict = {}
        for cid in np.unique(final_labels):
            pos_in_cluster = np.where(final_labels == cid)[0]
            best_pos       = pos_in_cluster[np.argmax(similarities[pos_in_cluster])]
            centroid_reps[int(cid)] = best_pos

        protected = set(centroid_reps.values())

        # ── Index trong data[] cần loại (sim > threshold, không phải rep) ─────
        too_close = {
            clean_indices[pos]
            for pos, sim in enumerate(similarities)
            if sim > threshold and pos not in protected
        }

        kept_data, kept_assignments = [], []
        for i, item in enumerate(data):
            if assignments[i] == -1:   # bỏ qua noise
                continue
            if i in too_close:         # bỏ qua điểm trùng lặp
                continue
            kept_data.append(item)
            kept_assignments.append(assignments[i])

        removed_count = len(too_close)
        print(f"   -> Loại bỏ (quá gần tâm): {removed_count} | Giữ lại: {len(kept_data)}")
        print("=== [FilterDeduplicate] Hoàn tất ===")

        output = self._build_output(kept_data, kept_assignments)
        output["removedCount"] = removed_count
        output["keptCount"]    = len(kept_data)
        return output
