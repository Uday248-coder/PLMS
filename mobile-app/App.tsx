import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from './src/store/auth';

import AuthScreen from './src/screens/AuthScreen';
import DriverDashboard from './src/screens/DriverDashboard';
import GuardDashboard from './src/screens/GuardDashboard';

const Stack = createNativeStackNavigator();

export default function App() {
  const { isLoading, token, role, checkLocalSession } = useAuthStore();

  useEffect(() => {
    checkLocalSession();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!token ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : role === 'guard' ? (
          <Stack.Screen name="GuardRoot" component={GuardDashboard} />
        ) : (
          <Stack.Screen name="DriverRoot" component={DriverDashboard} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
