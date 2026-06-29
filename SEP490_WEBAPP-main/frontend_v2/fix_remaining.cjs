const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/pages/DataPrepView.tsx',
  'src/pages/StaffLabelView.tsx',
  'src/pages/DataPrep/stages/Stage3Labeling.tsx',
  'src/pages/DataPrep/stages/Stage4TrainEval.tsx',
  'src/pages/DataPrep/stages/Stage5Evaluation.tsx',
  'src/pages/DataPrep/stages/Stage6Finish.tsx',
  'src/components/dataprep/Stage3Labeling.tsx',
  'src/components/dataprep/Stage3AiReview.tsx',
  'src/components/BatchTestingModal.tsx'
];

for (const relPath of filesToUpdate) {
  const filePath = path.join(__dirname, relPath);
  if (!fs.existsSync(filePath)) {
    console.log('Skipping ' + relPath + ' because it does not exist.');
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');

  // Exact type union strings
  content = content.replace(/'deepseek' \| 'openai' \| 'gemini'/g, "'deepseek' | 'groq' | 'openrouter'");
  content = content.replace(/'gemini' \| 'openai' \| 'deepseek'/g, "'openrouter' | 'groq' | 'deepseek'");
  
  // Specific object keys
  content = content.replace(/gemini:/g, "openrouter:");
  content = content.replace(/openai:/g, "groq:");
  
  content = content.replace(/scores\.gemini/g, "scores.openrouter");
  content = content.replace(/scores\.openai/g, "scores.groq");
  
  // Value strings
  content = content.replace(/"gemini"/g, '"openrouter"');
  content = content.replace(/'gemini'/g, "'openrouter'");
  content = content.replace(/"openai"/g, '"groq"');
  content = content.replace(/'openai'/g, "'groq'");

  // Labels in UI
  content = content.replace(/>Gemini</g, ">OpenRouter<");
  content = content.replace(/label: 'Gemini'/g, "label: 'OpenRouter'");
  content = content.replace(/label: 'Gemini 2\.0 Flash'/g, "label: 'OpenRouter'");
  content = content.replace(/>ChatGPT</g, ">Groq<");
  content = content.replace(/label: 'ChatGPT'/g, "label: 'Groq'");
  content = content.replace(/GEMINI/g, "OPENROUTER");

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated ' + relPath);
}

