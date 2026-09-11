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
  container: { flex: 1, backgroundColor: '#faf9f8', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, backgroundColor: 'rgba(255, 255, 255, 0.85)', borderRadius: 24, padding: 28, shadowColor: '#292524', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 28, textAlign: 'center', color: '#1c1917' },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#f5f4f1', borderRadius: 14, padding: 5, marginBottom: 24 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: 'white', shadowColor: '#292524', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  toggleText: { fontSize: 16, fontWeight: '600', color: '#b89d91' },
  toggleTextActive: { color: '#292524' },
  input: { backgroundColor: '#f5f4f1', borderWidth: 1, borderColor: '#e8e6e1', borderRadius: 14, padding: 18, marginBottom: 16, fontSize: 16, color: '#1c1917' },
  primaryButton: { backgroundColor: '#a37c6d', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 10, shadowColor: '#a37c6d', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  primaryButtonText: { color: 'white', fontSize: 17, fontWeight: '700' },
  switchModeBtn: { marginTop: 20, alignItems: 'center' },
  switchModeText: { color: '#a37c6d', fontSize: 15, fontWeight: '600' }
});
