const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/sep_training');
  console.log('Connected to DB sep_training');
  
  const results = await mongoose.connection.collection('multimodelevaluationresults').find().sort({ createdAt: -1 }).limit(3).toArray();
  for (const r of results) {
    console.log(`Sample: ${r.sampleId}`);
    if (r.scores) {
      console.log(`Scores:`, r.scores);
    }
    if (r.modelScores) {
      console.log(`Model Scores:`);
      for (const k of Object.keys(r.modelScores)) {
        console.log(`  ${k}: ${r.modelScores[k]?.status} - ${r.modelScores[k]?.errorCode} - ${r.modelScores[k]?.reason}`);
        if (r.modelScores[k]?.errorDetail) console.log(`    Detail: ${r.modelScores[k]?.errorDetail}`);
      }
    }
    console.log('---');
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
