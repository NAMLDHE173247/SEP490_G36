"""Small compatibility guards for the PEFT/torchao versions on hosted GPUs.

Some Kaggle images contain a PEFT ``TorchaoLoraLinear`` class whose
constructor requires ``get_apply_tensor_subclass`` while its dispatcher does
not pass that keyword.  Unsloth reaches that dispatcher when a quantized
linear layer is wrapped with LoRA, so the failure happens before the first
training step.  Forward/training do not need the re-quantization callback;
only adapter merge/unmerge does.
"""

import inspect


def patch_torchao_lora_constructor(peft_torchao_module=None):
    """Make old PEFT torchao dispatchers pass a safe callback value.

    Returns a small status dictionary for logging.  The optional module
    argument keeps this helper testable without importing the full PEFT stack.
    The patch is idempotent and only activates when the installed constructor
    has a required keyword-only ``get_apply_tensor_subclass`` parameter.
    """
    try:
        if peft_torchao_module is None:
            import peft.tuners.lora.torchao as peft_torchao_module

        original = getattr(peft_torchao_module, "TorchaoLoraLinear", None)
        if original is None:
            return {"patched": False, "reason": "TorchaoLoraLinear unavailable"}
        if getattr(original, "_sep490_compat", False):
            return {"patched": False, "reason": "already patched"}

        parameter = inspect.signature(original.__init__).parameters.get(
            "get_apply_tensor_subclass"
        )
        if parameter is None or parameter.default is not inspect.Parameter.empty:
            return {"patched": False, "reason": "constructor already compatible"}

        class CompatibleTorchaoLoraLinear(original):
            _sep490_compat = True

            def __init__(self, *args, **kwargs):
                kwargs.setdefault("get_apply_tensor_subclass", None)
                super().__init__(*args, **kwargs)

        CompatibleTorchaoLoraLinear.__name__ = original.__name__
        CompatibleTorchaoLoraLinear.__qualname__ = original.__qualname__
        peft_torchao_module.TorchaoLoraLinear = CompatibleTorchaoLoraLinear
        return {
            "patched": True,
            "reason": "dispatcher omitted get_apply_tensor_subclass",
        }
    except Exception as exc:  # pragma: no cover - depends on installed GPU stack
        return {"patched": False, "reason": f"compat probe failed: {exc}"}
