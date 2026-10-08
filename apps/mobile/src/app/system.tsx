import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import type { AdminProfileRow, RoleChangeRow } from '@scenarys/shared';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import AuditRow from '../ui/AuditRow';
import CapabilityGate from '../ui/CapabilityGate';
import EmptyState from '../ui/EmptyState';
import ProfileControls from '../ui/ProfileControls';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import SystemStatus, { type ServiceState } from '../ui/SystemStatus';

type Loaded<T> = { data: T } | { error: string } | null;

/** The control surface. Each part appears only if the API granted its capability, and each request is still checked by the server. */
export default function System() {
  const { api, capabilities, model, status } = useAccount();
  const [health, setHealth] = useState<ServiceState[]>([{ name: 'api', state: 'checking' }]);
  const [people, setPeople] = useState<Loaded<AdminProfileRow[]>>(null);
  const [audit, setAudit] = useState<Loaded<RoleChangeRow[]>>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Applies one admin action and replaces that row with what the server returns; audit reloads to show it. */
  async function act(action: () => Promise<AdminProfileRow>) {
    setNotice(null);
    try {
      const updated = await action();
      setPeople(current => current && 'data' in current ? { data: current.data.map(row => row.id === updated.id ? updated : row) } : current);
      if (model.system.audit) api.roleChanges().then(data => setAudit({ data }), () => undefined);
    } catch (error) { setNotice(errorMessage(error)); }
  }
  const back = () => router.canGoBack() ? router.back() : router.replace('/account');

  useEffect(() => {
    if (model.system.status) api.health().then(
      result => setHealth([{ name: result.service, state: 'ok', detail: `v${result.version} · ${result.latencyMs} ms` }]),
      () => setHealth([{ name: 'api', state: 'down' }]));
    if (model.system.people) api.profiles().then(data => setPeople({ data }), error => setPeople({ error: errorMessage(error) }));
    if (model.system.audit) api.roleChanges().then(data => setAudit({ data }), error => setAudit({ error: errorMessage(error) }));
  }, [api, model.system.status, model.system.people, model.system.audit]);

  if (status === 'loading') return <Screen title="sistema" onBack={back}><EmptyState text="…" /></Screen>;
  if (!model.system.visible) return <Screen title="sistema" onBack={back}><EmptyState text="Tu cuenta no tiene acceso a esta parte." /></Screen>;

  const names = new Map((people && 'data' in people ? people.data : []).map(person => [person.id, person.displayName]));
  const who = (id: string | null) => id === null ? 'sistema' : names.get(id) ?? id.slice(0, 8);

  return (
    <Screen title="sistema" onBack={back}>
      <CapabilityGate capabilities={capabilities} need="system.manage">
        <Section label="salud"><SystemStatus services={health} /></Section>
      </CapabilityGate>

      <CapabilityGate capabilities={capabilities} need="profile.read.any">
        <Section label="perfiles">
          {people === null ? <EmptyState text="…" /> : 'error' in people ? <EmptyState alert text={people.error} /> :
            people.data.length === 0 ? <EmptyState text="No hay perfiles." /> :
            people.data.map(person => <ProfileControls key={person.id} person={person}
              onAssignRole={model.system.assignRole ? role => act(() => api.assignRole(person.id, role)) : undefined}
              onSetDisabled={model.system.disable ? disabled => act(() => api.setDisabled(person.id, disabled)) : undefined} />)}
          {notice && <EmptyState alert text={notice} />}
        </Section>
      </CapabilityGate>

      <CapabilityGate capabilities={capabilities} need="role_changes.read">
        <Section label="auditoría de roles">
          {audit === null ? <EmptyState text="…" /> : 'error' in audit ? <EmptyState alert text={audit.error} /> :
            audit.data.length === 0 ? <EmptyState text="Sin cambios de rol." /> :
            audit.data.map(change => <AuditRow key={change.id} at={change.at} actor={who(change.actorId)} target={who(change.targetId)} from={change.from} to={change.to} reason={change.reason} />)}
        </Section>
      </CapabilityGate>
    </Screen>
  );
}
