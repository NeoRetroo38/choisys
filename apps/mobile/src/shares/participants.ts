import type { ShareParticipant } from '@scenarys/shared';

export type ParticipantOrder = 'similarity' | 'date' | 'name';
export type ParticipantFilter = 'all' | 'completed' | 'pending';

/** Ordering and filtering of the list only. «similitud» keeps the ranking the server derived from the engine. */
export function participantRows(people: ShareParticipant[], order: ParticipantOrder, filter: ParticipantFilter): ShareParticipant[] {
  const kept = people.filter(person => filter === 'all' || (filter === 'completed') === (person.runs.length > 0));
  const lastSeen = (person: ShareParticipant) => person.runs[0]?.completedAt ?? person.joinedAt;
  if (order === 'date') return [...kept].sort((a, b) => lastSeen(b).localeCompare(lastSeen(a)));
  if (order === 'name') return [...kept].sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  return kept;
}
