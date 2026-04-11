import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MotiView } from 'moti';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { useMultiplayerStore } from '../store/useMultiplayerStore';

const QR_PREFIX = 'NESHBESH:';

export const LobbyScreen: React.FC = () => {
  const {
    lobbyState, playerName, opponentName, roomId, role,
    setPlayerName, hostRoom, joinExistingRoom, goToGame,
    startLocalGame, resetToLobby,
  } = useMultiplayerStore();

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleCreateRoom = async () => {
    if (!playerName.trim()) {
      Alert.alert('שם חסר', 'הזן את שמך לפני יצירת חדר');
      return;
    }
    await hostRoom();
  };

  const handleStartScanning = async () => {
    if (!playerName.trim()) {
      Alert.alert('שם חסר', 'הזן את שמך לפני הצטרפות');
      return;
    }
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('הרשאת מצלמה', 'יש צורך בהרשאת מצלמה לסריקת QR');
        return;
      }
    }
    setScanning(true);
    setScanned(false);
  };

  const handleBarCodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    let code = data;
    if (data.startsWith(QR_PREFIX)) {
      code = data.substring(QR_PREFIX.length);
    }

    const success = await joinExistingRoom(code.trim().toUpperCase());
    if (!success) {
      Alert.alert('שגיאה', 'לא נמצא חדר עם הקוד הזה, או שהחדר מלא');
      setScanned(false);
    } else {
      setScanning(false);
    }
  }, [scanned, joinExistingRoom]);

  const handleStartGame = () => {
    goToGame();
  };

  // ── QR Scanning View ────────────────────────────────────────────────────────
  if (scanning) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar style="light" />
        <View style={s.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
          <View style={s.scannerOverlay}>
            <View style={s.scannerFrame} />
            <Text style={s.scannerText}>סרוק את קוד ה-QR של היריב</Text>
          </View>
          <TouchableOpacity style={s.cancelScanBtn} onPress={() => setScanning(false)}>
            <Text style={s.cancelScanText}>ביטול</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main Lobby ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Logo */}
        <MotiView
          from={{ opacity: 0, translateY: -20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 600 }}
          style={s.logoArea}
        >
          <View style={s.logoRow}>
            <Text style={s.titleNesh}>Nesh</Text>
            <Text style={s.titleBesh}>Besh</Text>
          </View>
          <Text style={s.subtitle}>שש-בש עם טוויסט</Text>
        </MotiView>

        {/* Content based on lobby state */}
        <MotiView
          from={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 400 }}
          style={s.card}
        >
          {/* ── IDLE: Name entry + buttons ────────────────────────────────── */}
          {lobbyState === 'IDLE' && (
            <>
              <Text style={s.cardTitle}>הזן את שמך</Text>
              <TextInput
                style={s.nameInput}
                value={playerName}
                onChangeText={setPlayerName}
                placeholder="השם שלך..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                maxLength={20}
                autoCorrect={false}
              />
              <View style={s.buttonGroup}>
                <TouchableOpacity style={s.primaryBtn} onPress={handleCreateRoom}>
                  <Text style={s.primaryBtnText}>צור חדר</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.secondaryBtn} onPress={handleStartScanning}>
                  <Text style={s.secondaryBtnText}>הצטרף לחדר</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={s.localBtn} onPress={startLocalGame}>
                <Text style={s.localBtnText}>משחק מקומי (שני שחקנים על מכשיר אחד)</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── HOSTING: QR code + waiting ────────────────────────────────── */}
          {lobbyState === 'HOSTING' && roomId && (
            <>
              <Text style={s.cardTitle}>ממתין ליריב...</Text>
              <View style={s.qrWrapper}>
                <QRCode
                  value={`${QR_PREFIX}${roomId}`}
                  size={180}
                  backgroundColor="white"
                  color="#1A0D05"
                />
              </View>
              <Text style={s.roomCode}>קוד חדר: {roomId}</Text>
              <ActivityIndicator color="#FFD700" style={{ marginTop: 16 }} />
              <Text style={s.waitText}>שתף את הקוד או תן ליריב לסרוק</Text>
              <TouchableOpacity style={s.cancelBtn} onPress={resetToLobby}>
                <Text style={s.cancelBtnText}>ביטול</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── CONNECTED: Both players in room ──────────────────────────── */}
          {lobbyState === 'CONNECTED' && (
            <>
              <Text style={s.cardTitle}>שני השחקנים מחוברים!</Text>
              <View style={s.playersRow}>
                <View style={s.playerCard}>
                  <Text style={s.playerEmoji}>🎲</Text>
                  <Text style={s.playerNameText}>{playerName}</Text>
                  <Text style={s.playerRole}>{role === 'host' ? 'לבן' : 'שחור'}</Text>
                </View>
                <Text style={s.vsText}>VS</Text>
                <View style={s.playerCard}>
                  <Text style={s.playerEmoji}>🎲</Text>
                  <Text style={s.playerNameText}>{opponentName}</Text>
                  <Text style={s.playerRole}>{role === 'host' ? 'שחור' : 'לבן'}</Text>
                </View>
              </View>
              <TouchableOpacity style={s.startBtn} onPress={handleStartGame}>
                <Text style={s.startBtnText}>התחל משחק!</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={resetToLobby}>
                <Text style={s.cancelBtnText}>ביטול</Text>
              </TouchableOpacity>
            </>
          )}
        </MotiView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0705' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },

  logoArea: { alignItems: 'center', marginBottom: 40 },
  logoRow: { flexDirection: 'row' },
  titleNesh: { fontSize: 42, fontWeight: '900', color: '#007AFF', letterSpacing: 2 },
  titleBesh: { fontSize: 42, fontWeight: '900', color: '#32CD32', letterSpacing: 2 },
  subtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 4, fontStyle: 'italic' },

  card: {
    backgroundColor: 'rgba(26, 13, 5, 0.95)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 20,
    textAlign: 'center',
  },

  nameInput: {
    width: '100%',
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: '#FFF',
    fontSize: 18,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },

  buttonGroup: { width: '100%', gap: 12 },
  primaryBtn: {
    backgroundColor: '#C5A55A',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#1A0D05', fontWeight: '900', fontSize: 18 },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  secondaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  localBtn: { marginTop: 20, paddingVertical: 8 },
  localBtnText: { color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center' },

  qrWrapper: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  roomCode: {
    color: '#FFD700',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  waitText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },

  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  playerCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  playerEmoji: { fontSize: 28, marginBottom: 8 },
  playerNameText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  playerRole: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, fontWeight: '600' },
  vsText: { color: '#FFD700', fontSize: 20, fontWeight: '900' },

  startBtn: {
    backgroundColor: '#32CD32',
    width: '100%',
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#32CD32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  startBtnText: { color: '#FFF', fontWeight: '900', fontSize: 20 },

  cancelBtn: { marginTop: 16, paddingVertical: 8 },
  cancelBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  // Scanner
  scannerContainer: { flex: 1 },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#FFD700',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  scannerText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 24,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cancelScanBtn: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  cancelScanText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
