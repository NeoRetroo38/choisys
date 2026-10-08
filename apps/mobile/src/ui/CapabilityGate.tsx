import type { ReactNode } from 'react';
import { can, type Capabilities, type Capability } from '../account/capabilities';

/** Renders its children only when the API granted every listed capability. Presentation only. */
export default function CapabilityGate({ capabilities, need, children, fallback = null }:
  { capabilities: Capabilities; need: Capability | Capability[]; children: ReactNode; fallback?: ReactNode }) {
  return <>{can(capabilities, ...(Array.isArray(need) ? need : [need])) ? children : fallback}</>;
}
