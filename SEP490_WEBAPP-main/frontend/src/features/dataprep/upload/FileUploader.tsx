import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiService } from '../../../services/api';
import { dataprepApi } from '../api/dataprepApi';
import { useAppStore } from '../../../hooks/useAppStore';
import toast from 'react-hot-toast';

export const FileUploader: React.FC = () => {
  const { uploadedFile, setUploadedFile } = useAppStore();
  const [showGuide, setShowGuide] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: apiService.uploadFile,
    onSuccess: (data) => {
      setUploadedFile(data);
      dataprepApi.deleteClusterCache().catch((err) => {
        console.error('Failed to clear cluster cache:', err);
      });
      toast.success('Tải tệp lên thành công!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Tải tệp lên thất bại');
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {
      if (fileRejections.length > 0) {
        const error = fileRejections[0].errors[0];
        if (error.code === 'file-too-large') {
          toast.error('Kích thước tệp quá lớn. Vui lòng chọn tệp dưới 50MB.');
        } else if (error.code === 'file-invalid-type') {
          toast.error('Định dạng tệp không hợp lệ. Chỉ chấp nhận tệp JSON, JSONL, CSV hoặc Excel.');
        } else {
          toast.error(error.message || 'Tệp không hợp lệ.');
        }
        return;
      }
      if (acceptedFiles.length > 0) {
        uploadMutation.mutate(acceptedFiles[0]);
      }
    },
    [uploadMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json', '.jsonl'],
      'application/x-jsonlines': ['.jsonl'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls', '.csv'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false,
    disabled: uploadMutation.isPending,
  });

  const handleRemove = () => {
    setUploadedFile(null);
  };

  if (uploadedFile) {
    return (
      <div className="bg-white rounded-lg border-2 border-green-500 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <File className="w-8 h-8 text-green-500 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-gray-900">
                {uploadedFile.filename}
              </h3>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                {uploadedFile.fileType === 'lesson' ? (
                  <>
                    <p>📚 {uploadedFile.lessonCount?.toLocaleString()} bài học</p>
                    <p>📝 {uploadedFile.exerciseCount?.toLocaleString()} bài tập</p>
                  </>
                ) : uploadedFile.fileType === 'openai_messages' ? (
                  <>
                    <p>🤖 Định dạng OpenAI Messages</p>
                    <p>📊 {uploadedFile.messageCount?.toLocaleString()} tin nhắn</p>
                    <p>💬 {uploadedFile.conversationCount?.toLocaleString()} hội thoại</p>
                  </>
                ) : (
                  <>
                    <p>📊 {uploadedFile.messageCount?.toLocaleString()} tin nhắn</p>
                    <p>💬 {uploadedFile.conversationCount?.toLocaleString()} hội thoại</p>
                  </>
                )}
                <p>📦 {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400'
          }
          ${uploadMutation.isPending ? 'opacity-50 cursor-wait' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload
          className={`w-16 h-16 mx-auto mb-4 ${isDragActive ? 'text-primary-500' : 'text-gray-400'
            }`}
        />
        {uploadMutation.isPending ? (
          <div>
            <p className="text-lg font-medium text-gray-700">Đang tải lên...</p>
            <p className="text-sm text-gray-500 mt-2">Vui lòng chờ trong giây lát</p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-medium text-gray-700">
              {isDragActive
                ? 'Thả tệp vào đây'
                : 'Kéo & thả tệp JSON/JSONL, CSV hoặc Excel vào đây'}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              hoặc nhấp để chọn tệp từ máy tính
            </p>
            <p className="text-xs text-gray-400 mt-4">
              Hỗ trợ định dạng JSON, JSONL, CSV và Excel (Tối đa: 50MB)
            </p>
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-100 hover:bg-gray-200 transition-colors text-sm font-medium text-gray-700"
        >
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-green-600" />
            <span>Hướng dẫn định dạng tệp CSV / Excel cố định</span>
          </div>
          {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showGuide && (
          <div className="p-4 space-y-4 text-xs text-gray-600 bg-white border-t border-gray-200">
            <div>
              <h4 className="font-semibold text-gray-800 mb-1 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block"></span>
                Định dạng 1: Hỏi đáp (QA / Alpaca Format)
              </h4>
              <p className="mb-2 text-gray-500">Mỗi dòng là một cặp câu hỏi - câu trả lời độc lập.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border border-gray-100 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-semibold text-gray-700">instruction</th>
                      <th className="px-3 py-1.5 text-left font-semibold text-gray-700">output</th>
                      <th className="px-3 py-1.5 text-left font-semibold text-gray-700">input (Tùy chọn)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-gray-800">Xin chào</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">Chào bạn! Tôi có thể giúp gì cho bạn?</td>
                      <td className="px-3 py-1.5 font-mono text-gray-400">[Trống]</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-gray-800">Hãy dịch đoạn văn này</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">Hello World</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">Xin chào thế giới</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                * Có thể đặt tiêu đề cột là: <code>instruction</code> (hoặc <code>prompt</code> / <code>question</code>) và <code>output</code> (hoặc <code>response</code> / <code>answer</code>).
              </p>
            </div>
            
            <div className="pt-3 border-t border-gray-100">
              <h4 className="font-semibold text-gray-800 mb-1 flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 inline-block"></span>
                Định dạng 2: Hội thoại (Conversational Format)
              </h4>
              <p className="mb-2 text-gray-500">Cho phép thiết lập cuộc hội thoại nhiều lượt giữa người dùng và trợ lý.</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border border-gray-100 rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-semibold text-gray-700">conversation_id</th>
                      <th className="px-3 py-1.5 text-left font-semibold text-gray-700">role</th>
                      <th className="px-3 py-1.5 text-left font-semibold text-gray-700">content</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-gray-800">chat_01</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">user</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">Thời tiết hôm nay thế nào?</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-gray-800">chat_01</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">assistant</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">Hôm nay trời nắng ráo và mát mẻ.</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 font-mono text-gray-800">chat_02</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">user</td>
                      <td className="px-3 py-1.5 font-mono text-gray-800">1 + 1 bằng mấy?</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                * Yêu cầu các cột: <code>conversation_id</code> (hoặc <code>session_id</code>), <code>role</code> (giá trị là user/assistant), và <code>content</code>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
