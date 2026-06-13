import mongoose from 'mongoose';
import { User } from './models/User';
import { DataPrepProject } from './models/DataPrepProject';
import { DatasetVersion } from './models/DatasetVersion';
import { ProcessedDatasetItem } from './models/ProcessedDatasetItem';
import { LabelAssignment } from './models/LabelAssignment';
import { ConversationQualityReview } from './models/ConversationQualityReview';

export async function seedDefaultStage4Data() {
  try {
    const supervisor = await User.findOne({ role: 'supervisor' });
    const staff = await User.findOne({ role: 'staff' });
    if (!supervisor || !staff) {
      console.log('⚠️ Supervisor or Staff user not found, skipping Stage 4 seeding');
      return;
    }

    const versionId = new mongoose.Types.ObjectId('60c72b2f9b1d8e25b8888888');
    const existingVersion = await DatasetVersion.findById(versionId);
    if (existingVersion) {
      console.log('✅ Stage 4 seeded data already exists');
      return;
    }

    console.log('🌱 Seeding default Stage 4 data...');

    // 1. Create Project
    let project = await DataPrepProject.findOne({ name: 'AutoTrain Math Project' });
    if (!project) {
      project = await DataPrepProject.create({
        ownerId: supervisor._id,
        name: 'AutoTrain Math Project',
        sourceType: 'chat',
        isArchived: false,
      });
      console.log('Created project:', project.name);
    }

    // 2. Create DatasetVersion
    const datasetVersion = await DatasetVersion.create({
      _id: versionId,
      projectId: project._id,
      ownerId: supervisor._id,
      projectName: 'AutoTrain Math Project',
      versionName: 'v1.0.0-seeded',
      operationType: 'legacy',
      similarityThreshold: 0.9,
      totalSamples: 20,
    });
    console.log('Created dataset version:', datasetVersion.versionName);

    // Update project with latest version
    project.rootVersionId = datasetVersion._id;
    project.latestVersionId = datasetVersion._id;
    await project.save();

    // 3. Define 20 Conversations
    const mockConversations = [
      {
        subject: 'MATH',
        userMsg: 'Giải phương trình bậc hai sau: x^2 - 5x + 6 = 0',
        assistantMsg: 'Để giải phương trình này, em hãy thử phân tích đa thức x^2 - 5x + 6 thành nhân tử xem sao?',
        intent: 'INCORRECT', // SCAFFOLDING matches INCORRECT
        action: 'SCAFFOLDING',
        score: 1.0,
      },
      {
        subject: 'MATH',
        userMsg: 'Em tìm ra nghiệm là x = 2 và x = 3 rồi ạ!',
        assistantMsg: 'Tuyệt vời! Em đã làm rất tốt. Hãy tiếp tục với bài tiếp theo nhé.',
        intent: 'CORRECT', // PRAISING matches CORRECT
        action: 'PRAISING',
        score: 1.0,
      },
      {
        subject: 'MATH',
        userMsg: 'Bài toán này khó quá, em không biết làm thế nào cả.',
        assistantMsg: 'Không sao đâu, hãy bắt đầu bằng việc xác định các hệ số a, b, c của phương trình trước nhé.',
        intent: 'REQUEST_HINT', // HINTING matches REQUEST_HINT
        action: 'HINTING',
        score: 1.0,
      },
      {
        subject: 'MATH',
        userMsg: 'Thầy ơi, tại sao lại dùng delta để tính nghiệm?',
        assistantMsg: 'Công thức nghiệm thu được bằng cách biến đổi phương trình về dạng bình phương một tổng, delta giúp ta xác định số lượng nghiệm.',
        intent: 'ASK_THEORY', // CONCEPT_CLARIFY matches ASK_THEORY
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'MATH',
        userMsg: 'Em tính ra delta âm thì phương trình thế nào hả thầy?',
        assistantMsg: 'Khi delta < 0, phương trình bậc hai sẽ vô nghiệm trên tập số thực em nhé.',
        intent: 'REQUEST_EXPLANATION', // LOGIC_BREAKDOWN matches REQUEST_EXPLANATION
        action: 'LOGIC_BREAKDOWN',
        score: 1.0,
      },
      {
        subject: 'PHYSICAL',
        userMsg: 'Lực hấp dẫn là gì thế thầy?',
        assistantMsg: 'Lực hấp dẫn là lực hút giữa mọi vật có khối lượng trong vũ trụ, ví dụ như lực hút giữa Trái Đất và Mặt Trăng.',
        intent: 'ASK_THEORY',
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'PHYSICAL',
        userMsg: 'Tại sao khi nhảy lên ta lại rơi xuống đất?',
        assistantMsg: 'Đó chính là do lực hấp dẫn của Trái Đất tác dụng lên cơ thể em, kéo em về phía tâm Trái Đất.',
        intent: 'REQUEST_EXPLANATION',
        action: 'LOGIC_BREAKDOWN',
        score: 1.0,
      },
      {
        subject: 'PHYSICAL',
        userMsg: 'Vận tốc ánh sáng là bao nhiêu ạ?',
        assistantMsg: 'Vận tốc ánh sáng trong chân không là khoảng 300,000 km/s em nhé.',
        intent: 'ASK_THEORY',
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'PHYSICAL',
        userMsg: 'Em tính ra động năng bằng 1/2 m v^2 đúng không thầy?',
        assistantMsg: 'Đúng rồi, em áp dụng công thức rất chính xác!',
        intent: 'CORRECT',
        action: 'PRAISING',
        score: 1.0,
      },
      {
        subject: 'PHYSICAL',
        userMsg: 'Tại sao xe đi nhanh phanh lại khó dừng hơn đi chậm?',
        assistantMsg: 'Vì động năng tỉ lệ với bình phương vận tốc. Vận tốc gấp đôi thì năng lượng va chạm và quãng đường phanh tăng gấp bốn lần.',
        intent: 'REQUEST_EXPLANATION',
        action: 'LOGIC_BREAKDOWN',
        score: 1.0,
      },
      {
        subject: 'CHEMISTRY',
        userMsg: 'Axit sunfuric có công thức hóa học là gì?',
        assistantMsg: 'Công thức hóa học của axit sunfuric là H2SO4 em nhé.',
        intent: 'ASK_THEORY',
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'CHEMISTRY',
        userMsg: 'Em viết H2SO4 đúng chưa thầy?',
        assistantMsg: 'Em viết hoàn toàn chính xác rồi, rất tốt!',
        intent: 'CORRECT',
        action: 'PRAISING',
        score: 1.0,
      },
      {
        subject: 'CHEMISTRY',
        userMsg: 'Em không biết cân bằng phương trình này.',
        assistantMsg: 'Hãy đếm số nguyên tử Fe ở hai vế trước, sau đó cân bằng gốc axit SO4 nhé.',
        intent: 'REQUEST_HINT',
        action: 'HINTING',
        score: 1.0,
      },
      {
        subject: 'CHEMISTRY',
        userMsg: 'Tại sao kim loại kiềm lại phản ứng mạnh với nước?',
        assistantMsg: 'Kim loại kiềm có electron lớp ngoài cùng rất dễ nhường đi, phản ứng tỏa nhiều nhiệt và giải phóng khí H2 gây nổ.',
        intent: 'REQUEST_EXPLANATION',
        action: 'LOGIC_BREAKDOWN',
        score: 1.0,
      },
      {
        subject: 'CHEMISTRY',
        userMsg: 'Nước cất có dẫn điện không thầy?',
        assistantMsg: 'Nước cất nguyên chất không dẫn điện vì nó chứa rất ít ion tự do em nhé.',
        intent: 'ASK_THEORY',
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'BIOLOGY',
        userMsg: 'Quá trình quang hợp là gì vậy thầy?',
        assistantMsg: 'Quang hợp là quá trình thực vật sử dụng ánh sáng mặt trời để tổng hợp chất hữu cơ và giải phóng khí O2 từ CO2 và nước.',
        intent: 'ASK_THEORY',
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'BIOLOGY',
        userMsg: 'Gen là gì ạ?',
        assistantMsg: 'Gen là một đoạn ADN mang thông tin mã hóa cho một chuỗi polypeptide hoặc ARN, là đơn vị di truyền cơ bản.',
        intent: 'ASK_THEORY',
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'BIOLOGY',
        userMsg: 'Em nghĩ tế bào nhân thực có màng nhân, còn tế bào nhân sơ thì không.',
        assistantMsg: 'Chính xác! Điểm khác biệt cốt lõi nhất chính là cấu trúc màng nhân bao bọc vật chất di truyền.',
        intent: 'CORRECT',
        action: 'PRAISING',
        score: 1.0,
      },
      {
        subject: 'LITERATURE',
        userMsg: 'Tác giả của Truyện Kiều là ai?',
        assistantMsg: 'Truyện Kiều là tác phẩm kiệt tác của đại thi hào Nguyễn Du em nhé.',
        intent: 'ASK_THEORY',
        action: 'CONCEPT_CLARIFY',
        score: 1.0,
      },
      {
        subject: 'LITERATURE',
        userMsg: 'Em không biết viết mở bài cho bài văn nghị luận này.',
        assistantMsg: 'Em có thể dẫn dắt từ đề tài chính của tác phẩm hoặc trích dẫn một câu nói nổi tiếng liên quan đến chủ đề.',
        intent: 'REQUEST_HINT',
        action: 'HINTING',
        score: 1.0,
      },
    ];

    const defaultRatings = {
      knowledgeAccuracy: 5,
      socraticPedagogical: 5,
      encouragement: 5,
      vietnameseLanguage: 5,
      completeness: 5,
      trainingReadiness: 5,
    };

    const defaultErrorFlags = {
      factualError: false,
      directAnswerIssue: false,
      languageIssue: false,
      needSupervisorReview: false,
    };

    for (let i = 0; i < mockConversations.length; i++) {
      const mock = mockConversations[i];
      const sampleIdStr = `conv_${String(i + 1).padStart(3, '0')}`;

      // Create ProcessedDatasetItem
      const item = await ProcessedDatasetItem.create({
        datasetVersionId: datasetVersion._id,
        sampleId: sampleIdStr,
        data: {
          messages: [
            { role: 'user', content: mock.userMsg },
            { role: 'assistant', content: mock.assistantMsg },
          ],
        },
      });

      // Create Subject Label Assignment
      await LabelAssignment.create({
        sampleId: item._id,
        name: mock.subject,
        type: 'hard',
        targetScope: 'sample',
        createdBy: supervisor._id,
      });

      // Create User Msg Intent Label Assignment
      await LabelAssignment.create({
        sampleId: item._id,
        name: mock.intent,
        type: 'hard',
        targetScope: 'message',
        messageIndex: 0,
        messageRole: 'user',
        createdBy: supervisor._id,
      });

      // Create Assistant Msg Action Label Assignment
      await LabelAssignment.create({
        sampleId: item._id,
        name: mock.action,
        type: 'hard',
        targetScope: 'message',
        messageIndex: 1,
        messageRole: 'assistant',
        createdBy: supervisor._id,
      });

      // Seed a few reviews/rewrites for testing Step 11
      if (i % 4 === 0) {
        // Create Quality Review by Supervisor
        await ConversationQualityReview.create({
          datasetVersionId: datasetVersion._id,
          sampleId: item._id,
          reviewerId: supervisor._id,
          qualityClassification: 'Gold',
          ratings: defaultRatings,
          errorFlags: defaultErrorFlags,
          note: 'Excellent seeded math answer.',
        });
      } else if (i % 4 === 1) {
        // Create conflicting Quality Reviews
        await ConversationQualityReview.create({
          datasetVersionId: datasetVersion._id,
          sampleId: item._id,
          reviewerId: supervisor._id,
          qualityClassification: 'Rewrite',
          ratings: {
            ...defaultRatings,
            knowledgeAccuracy: 3,
            socraticPedagogical: 3,
          },
          errorFlags: {
            ...defaultErrorFlags,
            factualError: true,
          },
          note: 'Needs slight pedagogy improvement.',
        });
      }
    }

    console.log('✅ Stage 4 seeding complete!');
  } catch (err: any) {
    console.error('❌ Stage 4 seeding failed:', err.message);
  }
}
