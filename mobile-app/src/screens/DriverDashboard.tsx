import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/auth';
import * as Haptics from 'expo-haptics';

export default function DriverDashboard() {
  const logout = useAuthStore(state => state.logout);

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logout();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Dashboard</Text>
      <Text style={styles.subtitle}>Your active tickets will appear here.</Text>
      <TouchableOpacity style={styles.btn} onPress={handleLogout}>
        <Text style={styles.btnText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf9f8' },
  title: { fontSize: 28, fontWeight: '800', color: '#1c1917' },
  subtitle: { color: '#8c6356', marginVertical: 12, fontSize: 16 },
  btn: { marginTop: 24, paddingVertical: 14, paddingHorizontal: 32, backgroundColor: '#eaddd7', borderRadius: 12 },
  btnText: { color: '#8a4d3a', fontWeight: '700', fontSize: 16 }
});
