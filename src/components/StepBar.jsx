// StepBar.jsx — step progress indicator in the topbar

import { STEPS } from '../constants.js';
import { Icon } from './icons.jsx';

export function StepBar({ stepIdx }) {
  return (
    <div className="stepbar">
      {STEPS.map((s, i) => {
        const state = i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'idle';
        return (
          <div key={s.id} className={`step step-${state}`}>
            <span className="step-num">
              {i < stepIdx ? <Icon.Check /> : String(i + 1).padStart(2, '0')}
            </span>
            <span className="step-label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
