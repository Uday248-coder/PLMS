import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import * as Haptics from 'expo-haptics';

interface Lot { id: string; name: string; location: string; }
interface Slot { id: string; zone: string; number: string; vehicle_type: string; status: string; session: string | null; vehicle_ref: string | null; }
interface AlertItem { slot_id: string; zone: string; number: string; status: string; session: string | null; vehicle_ref: string | null; }

export default function GuardDashboard() {
  const logout = useAuthStore(state => state.logout);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [pending, setPending] = useState<AlertItem[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const loadAll = async (id?: string) => {
    const l = lots.length ? lots : await api<Lot[]>('/api/lots');
    if (!lots.length) setLots(l);
    const lid = id ?? lotId ?? l[0]?.id ?? '';
    if (!lid) return;
    if (!lotId || id) setLotId(lid);
    const [s, a] = await Promise.all([
      api<Slot[]>(`/api/lots/${lid}/slots`),
      api<{ needs_guard_action: AlertItem[]; overdue: any[] }>(`/api/lots/${lid}/alerts`),
    ]);
    setSlots(s);
    setPending(a.needs_guard_action ?? []);
    setOverdue(a.overdue ?? []);
  };

  const refresh = async () => {
    setRefreshing(true); setErr('');
    try { await loadAll(); } catch (e: any) { setErr(e.message || 'Failed to load'); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await loadAll(); } catch (e: any) { setErr(e.message || 'Failed to load. Check connection.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const act = async (path: string, sessionId: string | null, okMsg: string) => {
    if (!sessionId) return;
    setLoading(true); setErr('');
    try {
      await api(path, 'POST', { session_id: sessionId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadAll();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErr(e.message || okMsg + ' failed');
    } finally { setLoading(false); }
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logout();
  };

  const lotName = lots.find(l => l.id === lotId)?.name ?? '';
  const free = slots.filter(s => s.status === 'free').length;

  if (loading && lots.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#a37c6d" /><Text style={styles.muted}>Loading lots…</Text></View>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={styles.title}>Guard {lotName ? `· ${lotName}` : ''}</Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}

      <View style={styles.rowWrap}>
        {lots.map(l => (
          <TouchableOpacity key={l.id} style={[styles.chip, l.id === lotId && styles.chipActive]}
            onPress={() => { setLotId(l.id); loadAll(l.id).catch((e: any) => setErr(e.message)); }}>
            <Text style={[styles.chipTx, l.id === lotId && styles.chipTxActive]}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.muted}>{free} of {slots.length} slots free · {pending.length} need action · {overdue.length} overdue</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚠️ Needs action ({pending.length})</Text>
        {pending.length === 0 ? <Text style={styles.muted}>All clear.</Text> : pending.map(p => (
          <View key={p.slot_id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{p.zone}-{p.number} · {p.vehicle_ref ?? '—'}</Text>
              <Text style={styles.muted}>{p.status}</Text>
            </View>
            <View style={styles.btnCol}>
              <TouchableOpacity style={styles.go} onPress={() => act('/api/guard/confirm', p.session, 'Confirm')}><Text style={styles.goTx}>Confirm</Text></TouchableOpacity>
              <TouchableOpacity style={styles.stop} onPress={() => act('/api/guard/deny', p.session, 'Deny')}><Text style={styles.stopTx}>Deny</Text></TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Slots ({slots.length})</Text>
        <View style={styles.grid}>
          {slots.map(s => (
            <View key={s.id} style={[styles.cell, s.status !== 'free' && styles.cellBusy]}>
              <Text style={styles.cellTx}>{s.zone}{s.number}</Text>
              <Text style={styles.cellSub}>{s.status === 'free' ? 'free' : s.vehicle_ref ?? s.status}</Text>
              {s.session && s.status !== 'free' ? (
                <TouchableOpacity style={styles.mini} onPress={() => act('/api/guard/checkout', s.session, 'Checkout')}>
                  <Text style={styles.miniTx}>Checkout</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.logout} onPress={handleLogout}>
        <Text style={styles.logoutTx}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#faf9f8' },
  pad: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf9f8' },
  title: { fontSize: 28, fontWeight: '800', color: '#1c1917', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginTop: 12, shadowColor: '#292524', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1c1917', marginBottom: 8 },
  muted: { color: '#8c6356', marginVertical: 4, fontSize: 14 },
  err: { color: '#b3261e', backgroundColor: '#fdecea', padding: 10, borderRadius: 10, marginBottom: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#f5f4f1', borderWidth: 1, borderColor: '#e8e6e1' },
  chipActive: { backgroundColor: '#1c1917', borderColor: '#1c1917' },
  chipTx: { fontWeight: '700', color: '#8c6356' },
  chipTxActive: { color: '#fff' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f0ede9' },
  itemTitle: { fontWeight: '700', color: '#1c1917', fontSize: 16 },
  btnCol: { flexDirection: 'row', gap: 8 },
  go: { backgroundColor: '#1c1917', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  goTx: { color: '#fff', fontWeight: '700' },
  stop: { backgroundColor: '#fdecea', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  stopTx: { color: '#b3261e', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31%', backgroundColor: '#f5f4f1', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#e8e6e1' },
  cellBusy: { backgroundColor: '#eaddd7', borderColor: '#d2c1b9' },
  cellTx: { fontWeight: '800', color: '#1c1917' },
  cellSub: { fontSize: 12, color: '#8c6356' },
  mini: { marginTop: 6, backgroundColor: '#1c1917', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  miniTx: { color: '#fff', fontSize: 12, fontWeight: '700' },
  logout: { marginTop: 16, paddingVertical: 14, backgroundColor: '#eaddd7', borderRadius: 12, alignItems: 'center' },
  logoutTx: { color: '#8a4d3a', fontWeight: '700', fontSize: 16 },
});
