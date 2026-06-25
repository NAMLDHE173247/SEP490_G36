const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/sep490'); // Replace with actual DB URI if different
  console.log('Connected to DB');
  
  const results = await mongoose.connection.collection('multimodelevaluationresults').find().sort({ createdAt: -1 }).limit(10).toArray();
  for (const r of results) {
    console.log(`Sample: ${r.sampleIdRef?.sampleId || r.sampleId}`);
    if (r.scores) {
      console.log(`Scores:`, r.scores);
    }
    if (r.modelScores) {
      console.log(`Model Scores:`);
      for (const k of Object.keys(r.modelScores)) {
        console.log(`  ${k}: ${r.modelScores[k]?.status} - ${r.modelScores[k]?.errorCode} - ${r.modelScores[k]?.reason}`);
      }
    }
    console.log('---');
  }

  const jobs = await mongoose.connection.collection('multimodelevaluationjobs').find().sort({ createdAt: -1 }).limit(1).toArray();
  if (jobs.length > 0) {
    console.log('Latest Job Models:', jobs[0].models);
    console.log('Job Error:', jobs[0].error);
    console.log('Job Progress:', jobs[0].progress);
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
