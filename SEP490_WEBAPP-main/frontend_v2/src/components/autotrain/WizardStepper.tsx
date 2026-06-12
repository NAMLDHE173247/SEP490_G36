import React, { useCallback } from 'react';
import { Upload, Settings2, Zap, Check } from 'lucide-react';
import type { WizardStep } from './types';

// ── Types ──────────────────────────────────────────────────────
interface WizardStepperProps {
  currentStep: WizardStep;
  completedSteps: number[];
  onStepClick: (step: WizardStep) => void;
}

// ── Step metadata ──────────────────────────────────────────────
const STEPS: { step: WizardStep; label: string; Icon: React.FC<React.SVGProps<SVGSVGElement> & { size?: number | string }> }[] = [
  { step: 1, label: 'Dataset',        Icon: Upload   },
  { step: 2, label: 'Configure',      Icon: Settings2 },
  { step: 3, label: 'Review & Train', Icon: Zap      },
];

// ── Component ──────────────────────────────────────────────────
const WizardStepper: React.FC<WizardStepperProps> = ({
  currentStep,
  completedSteps,
  onStepClick,
}) => {
  const isCompleted = useCallback(
    (step: number) => completedSteps.includes(step),
    [completedSteps],
  );

  const getStepState = useCallback(
    (step: WizardStep): 'completed' | 'active' | 'pending' => {
      if (isCompleted(step)) return 'completed';
      if (step === currentStep) return 'active';
      return 'pending';
    },
    [currentStep, isCompleted],
  );

  const handleStepClick = useCallback(
    (step: WizardStep) => {
      if (isCompleted(step)) {
        onStepClick(step);
      }
    },
    [isCompleted, onStepClick],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, step: WizardStep) => {
      if ((e.key === 'Enter' || e.key === ' ') && isCompleted(step)) {
        e.preventDefault();
        onStepClick(step);
      }
    },
    [isCompleted, onStepClick],
  );

  return (
    <nav className="at-wizard-stepper" aria-label="Training wizard progress">
      {STEPS.map(({ step, label, Icon }, idx) => {
        const state = getStepState(step);
        const clickable = state === 'completed';

        return (
          <React.Fragment key={step}>
            {/* Connector line between steps */}
            {idx > 0 && (
              <div
                className={`at-wizard-connector ${
                  isCompleted(STEPS[idx - 1].step)
                    ? 'at-wizard-connector-active'
                    : ''
                }`}
                aria-hidden="true"
              />
            )}

            {/* Step circle + label */}
            <div
              className={`at-wizard-step at-wizard-step-${state}`}
              role="button"
              tabIndex={clickable ? 0 : -1}
              aria-current={state === 'active' ? 'step' : undefined}
              aria-disabled={!clickable}
              aria-label={`Step ${step}: ${label}${
                state === 'completed'
                  ? ' (completed)'
                  : state === 'active'
                    ? ' (current)'
                    : ' (pending)'
              }`}
              onClick={() => handleStepClick(step)}
              onKeyDown={(e) => handleKeyDown(e, step)}
            >
              <span className="at-wizard-step-circle">
                {state === 'completed' ? (
                  <Check size={18} aria-hidden="true" />
                ) : (
                  <Icon size={18} aria-hidden="true" />
                )}
              </span>
              <span className="at-wizard-step-label">{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default WizardStepper;
