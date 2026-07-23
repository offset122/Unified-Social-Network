import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unified Social Network</Text>
      <Text style={styles.subtitle}>Welcome to your social platform</Text>
      <View style={styles.card}>
        <Text style={styles.cardText}>🚀 Build amazing experiences</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardText}>👥 Connect with others</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardText}>💬 Share your thoughts</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    marginVertical: 10,
    borderRadius: 10,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
  },
});
