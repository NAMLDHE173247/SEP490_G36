const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://127.0.0.1:27017/sep_training';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    const schema = new mongoose.Schema({}, { strict: false, collection: 'modelevaluations' });
    const ModelEvaluation = mongoose.model('ModelEvaluation', schema);

    const evals = await ModelEvaluation.find({ status: 'COMPLETED' }, {
      modelEvalId: 1,
      jobId: 1,
      ftModelRepo: 1,
      status: 1,
      summary: 1,
      datasetVersionName: 1,
      createdAt: 1
    }).sort({ createdAt: -1 }).limit(10);

    console.log(`Found ${evals.length} completed evaluations:`);
    evals.forEach(e => {
      console.log(JSON.stringify({
        modelEvalId: e.modelEvalId,
        jobId: e.jobId,
        ftModelRepo: e.get('ftModelRepo'),
        datasetVersionName: e.get('datasetVersionName'),
        createdAt: e.createdAt,
        summary: e.get('summary'),
      }, null, 2));
    });

    await mongoose.connection.close();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
  });
