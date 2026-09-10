import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/auth';

export default function GuardDashboard() {
  const logout = useAuthStore(state => state.logout);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Guard Dashboard</Text>
      <Text style={styles.subtitle}>Lot overview and scanner goes here.</Text>
      <TouchableOpacity style={styles.btn} onPress={logout}>
        <Text style={styles.btnText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { color: 'gray', marginVertical: 10 },
  btn: { marginTop: 20, padding: 10, backgroundColor: 'red', borderRadius: 8 },
  btnText: { color: 'white', fontWeight: 'bold' }
});
