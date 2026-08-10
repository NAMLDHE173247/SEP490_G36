import torch
from transformers import Trainer, TrainingArguments, TrainerCallback
from transformers import AutoModelForCausalLM, AutoTokenizer
import datasets

class MyCallback(TrainerCallback):
    def on_prediction_step(self, args, state, control, **kwargs):
        print("on_prediction_step CALLED!")

print("Loading model...")
model = AutoModelForCausalLM.from_pretrained("gpt2")
tokenizer = AutoTokenizer.from_pretrained("gpt2")
tokenizer.pad_token = tokenizer.eos_token

def tokenize_function(examples):
    return tokenizer(examples["text"], padding="max_length", truncation=True, max_length=16)

dataset = datasets.Dataset.from_dict({"text": ["Hello world"] * 4})
tokenized_datasets = dataset.map(tokenize_function, batched=True)

training_args = TrainingArguments(
    output_dir="./test_trainer",
    per_device_eval_batch_size=2,
    do_eval=True,
    report_to="none"
)

trainer = Trainer(
    model=model,
    args=training_args,
    eval_dataset=tokenized_datasets,
    callbacks=[MyCallback()]
)

print("Evaluating...")
trainer.evaluate()
print("Done.")
