import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import * as Haptics from 'expo-haptics';

interface Lot { id: string; name: string; location: string; }
interface Slot { id: string; zone: string; number: string; vehicle_type: string; status: string; session: string | null; vehicle_ref: string | null; }
interface Ticket { session_id: string; zone: string; number: string; status: string; }

const TICKET_KEY = 'park_ticket';

export default function DriverDashboard() {
  const logout = useAuthStore(state => state.logout);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [plate, setPlate] = useState('');
  const [vtype, setVtype] = useState<'car' | 'bike'>('car');
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const loadLots = async () => {
    const l = await api<Lot[]>('/api/lots');
    setLots(l);
    if (l.length && !lotId) setLotId(l[0].id);
    return l;
  };

  const loadSlots = async (id: string) => {
    if (!id) return;
    const s = await api<Slot[]>(`/api/lots/${id}/slots`);
    setSlots(s);
  };

  const refresh = async () => {
    setRefreshing(true);
    setErr('');
    try {
      const l = lots.length ? lots : await loadLots();
      const id = lotId || l[0]?.id || '';
      if (id) { if (!lotId) setLotId(id); await loadSlots(id); }
    } catch (e: any) {
      setErr(e.message || 'Failed to load');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(TICKET_KEY);
        if (saved) setTicket(JSON.parse(saved));
      } catch { /* ignore */ }
      setLoading(true);
      try {
        const l = await loadLots();
        if (l[0]) await loadSlots(l[0].id);
      } catch (e: any) {
        setErr(e.message || 'Failed to load. Check connection.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => { if (lotId) loadSlots(lotId).catch(() => {}); }, [lotId]);

  const saveTicket = async (t: Ticket | null) => {
    setTicket(t);
    try {
      if (t) await AsyncStorage.setItem(TICKET_KEY, JSON.stringify(t));
      else await AsyncStorage.removeItem(TICKET_KEY);
    } catch { /* ignore */ }
  };

  const checkin = async () => {
    if (!plate.trim()) { Alert.alert('Plate required', 'Enter your vehicle number.'); return; }
    if (!lotId) { Alert.alert('No lot', 'Pick a lot first.'); return; }
    setLoading(true); setErr('');
    try {
      const res = await api<Ticket>('/api/checkin', 'POST', {
        lot_id: lotId, vehicle_type: vtype, vehicle_ref: plate.trim(),
        flow_type: 'self_report', estimated_minutes: 420,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await saveTicket(res);
      await loadSlots(lotId);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErr(e.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  const tap = async (path: string, body?: any, okMsg?: string) => {
    if (!ticket) return;
    setLoading(true); setErr('');
    try {
      const res = await api<any>(path, 'POST', body ?? { session_id: ticket.session_id });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (res?.status) setTicket({ ...ticket, status: res.status });
      if (okMsg) Alert.alert('Done', okMsg);
      await loadSlots(lotId);
    } catch (e: any) {
      setErr(e.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logout();
  };

  const free = slots.filter(s => s.status === 'free').length;
  const lotName = lots.find(l => l.id === lotId)?.name ?? '';

  if (loading && !refreshing && lots.length === 0) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#a37c6d" /><Text style={styles.muted}>Loading lots…</Text></View>;
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={styles.title}>Driver</Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}

      {ticket ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎫 Active ticket</Text>
          <Text style={styles.big}>{ticket.zone}-{ticket.number}</Text>
          <Text style={styles.muted}>Status: {ticket.status}</Text>
          <Text style={styles.muted}>Session: {ticket.session_id.slice(0, 8)}…</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.primary} onPress={() => tap('/api/driver/parked', undefined, 'Marked as parked.')}><Text style={styles.primaryTx}>I'm parked</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => tap('/api/driver/leaving', undefined, 'Marked as leaving.')}><Text style={styles.secondaryTx}>Leaving</Text></TouchableOpacity>
          </View>
          <View style={styles.row}>
            <TouchableOpacity style={styles.secondary} onPress={() => tap('/api/driver/extend', { session_id: ticket.session_id, additional_minutes: 60 }, 'Extended by 1 hour.')}><Text style={styles.secondaryTx}>+1h extend</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => { saveTicket(null); refresh(); }}><Text style={styles.secondaryTx}>New ticket</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>New parking ticket {lotName ? `· ${lotName}` : ''}</Text>
          <Text style={styles.label}>Lot</Text>
          <View style={styles.rowWrap}>
            {lots.map(l => (
              <TouchableOpacity key={l.id} style={[styles.chip, l.id === lotId && styles.chipActive]} onPress={() => setLotId(l.id)}>
                <Text style={[styles.chipTx, l.id === lotId && styles.chipTxActive]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.muted}>{free} of {slots.length} slots free</Text>
          <Text style={styles.label}>Vehicle type</Text>
          <View style={styles.row}>
            {(['car', 'bike'] as const).map(v => (
              <TouchableOpacity key={v} style={[styles.chip, v === vtype && styles.chipActive]} onPress={() => setVtype(v)}>
                <Text style={[styles.chipTx, v === vtype && styles.chipTxActive]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Plate number</Text>
          <TextInput style={styles.input} placeholder="e.g. KA05MN1234" autoCapitalize="characters" value={plate} onChangeText={setPlate} />
          <TouchableOpacity style={styles.primary} onPress={checkin} disabled={loading}>
            <Text style={styles.primaryTx}>{loading ? 'Please wait…' : 'Get slot (7h)'}</Text>
          </TouchableOpacity>
        </View>
      )}

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
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#292524', shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1c1917', marginBottom: 10 },
  big: { fontSize: 44, fontWeight: '800', color: '#1c1917' },
  label: { fontSize: 14, fontWeight: '600', color: '#8c6356', marginTop: 12, marginBottom: 6 },
  muted: { color: '#8c6356', marginVertical: 4, fontSize: 14 },
  err: { color: '#b3261e', backgroundColor: '#fdecea', padding: 10, borderRadius: 10, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#f5f4f1', borderWidth: 1, borderColor: '#e8e6e1' },
  chipActive: { backgroundColor: '#1c1917', borderColor: '#1c1917' },
  chipTx: { fontWeight: '700', color: '#8c6356' },
  chipTxActive: { color: '#fff' },
  input: { backgroundColor: '#f5f4f1', borderWidth: 1, borderColor: '#e8e6e1', borderRadius: 14, padding: 16, fontSize: 16, color: '#1c1917' },
  primary: { flex: 1, backgroundColor: '#a37c6d', padding: 16, borderRadius: 14, alignItems: 'center' },
  primaryTx: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: { flex: 1, backgroundColor: '#eaddd7', padding: 16, borderRadius: 14, alignItems: 'center' },
  secondaryTx: { color: '#8a4d3a', fontWeight: '700' },
  logout: { marginTop: 8, paddingVertical: 14, paddingHorizontal: 32, backgroundColor: '#eaddd7', borderRadius: 12, alignItems: 'center' },
  logoutTx: { color: '#8a4d3a', fontWeight: '700', fontSize: 16 },
});
