import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import * as Haptics from 'expo-haptics';

export default function AuthScreen() {
  const [mode, setMode] = useState<'driver' | 'guard'>('driver');
  const [isLogin, setIsLogin] = useState(true);
  
  const [emailOrName, setEmailOrName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuthStore(state => state.login);

  const handleSubmit = async () => {
    if (!emailOrName || !password) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Missing fields", "Please enter both credentials.");
      return;
    }
    
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      let endpoint = '';
      if (mode === 'guard') {
        endpoint = '/api/auth/guard/login';
      } else {
        endpoint = isLogin ? '/api/auth/driver/login' : '/api/auth/driver/register';
      }

      const res = await api<any>(endpoint, 'POST', {
        username_or_email: emailOrName,
        password: password
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await login(res.token, res.role, res.id);
      
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Authentication Failed", err.message || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Welcome Back</Text>

        <View style={styles.toggleContainer}>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'driver' && styles.toggleBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setMode('driver'); }}
          >
            <Text style={[styles.toggleText, mode === 'driver' && styles.toggleTextActive]}>Driver</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'guard' && styles.toggleBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setMode('guard'); setIsLogin(true); }}
          >
            <Text style={[styles.toggleText, mode === 'guard' && styles.toggleTextActive]}>Guard</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder={mode === 'driver' ? "Email" : "Guard Name"}
          autoCapitalize="none"
          value={emailOrName}
          onChangeText={setEmailOrName}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? "Please wait..." : (isLogin ? "Sign In" : "Create Account")}
          </Text>
        </TouchableOpacity>

        {mode === 'driver' && (
          <TouchableOpacity 
            style={styles.switchModeBtn}
            onPress={() => { Haptics.selectionAsync(); setIsLogin(!isLogin); }}
          >
            <Text style={styles.switchModeText}>
              {isLogin ? "Need an account? Register" : "Already have an account? Sign In"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, backgroundColor: 'white', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: '#111827' },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 12, padding: 4, marginBottom: 24 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  toggleText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#111827' },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16 },
  primaryButton: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  switchModeBtn: { marginTop: 16, alignItems: 'center' },
  switchModeText: { color: '#2563eb', fontSize: 14, fontWeight: '600' }
});
