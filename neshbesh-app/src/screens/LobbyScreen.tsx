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
  Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MotiView } from 'moti';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { useMultiplayerStore } from '../store/useMultiplayerStore';
import { getShareUrl } from '../services/multiplayerService';
import { isFirebaseConfigured } from '../config/firebase';

const QR_PREFIX = 'NESHBESH:';

export const LobbyScreen: React.FC = () => {
  const {
    lobbyState, playerName, opponentName, roomId, role,
    pendingJoinCode, setPendingJoinCode,
    setPlayerName, hostRoom, joinExistingRoom, goToGame,
    startLocalGame, resetToLobby,
  } = useMultiplayerStore();

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showQrFallback, setShowQrFallback] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [showMoreJoinOptions, setShowMoreJoinOptions] = useState(false);

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

  // ── Deep-link arrival: auto-join if name set, otherwise prefill code ──────
  useEffect(() => {
    if (!pendingJoinCode || lobbyState !== 'IDLE') return;
    if (playerName.trim()) {
      // Name already set — auto-join immediately
      (async () => {
        const ok = await joinExistingRoom(pendingJoinCode);
        setPendingJoinCode(null);
        if (!ok) {
          Alert.alert('שגיאה', 'לא נמצא חדר עם הקוד הזה, או שהחדר מלא');
        }
      })();
    } else {
      // No name yet — prefill manual code field; user submits after typing name
      setJoinCodeInput(pendingJoinCode);
      setShowMoreJoinOptions(true);
    }
  }, [pendingJoinCode, playerName, lobbyState]);

  const handleManualJoin = useCallback(async () => {
    if (!playerName.trim()) {
      Alert.alert('שם חסר', 'הזן את שמך לפני הצטרפות');
      return;
    }
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 4) {
      Alert.alert('קוד לא תקין', 'הזן קוד חדר בן 6 תווים');
      return;
    }
    const ok = await joinExistingRoom(code);
    if (!ok) {
      Alert.alert('שגיאה', 'לא נמצא חדר עם הקוד הזה, או שהחדר מלא');
    } else {
      setPendingJoinCode(null);
    }
  }, [playerName, joinCodeInput, joinExistingRoom, setPendingJoinCode]);

  const handleShareInvite = useCallback(async () => {
    if (!roomId) return;
    const url = getShareUrl(roomId);
    try {
      await Share.share({
        message: `הצטרף למשחק NeshBesh שלי: ${url}\n\nאו הזן קוד חדר: ${roomId}`,
        url, // iOS-only; Android ignores and uses message
      });
    } catch {
      // User dismissed share sheet — no-op
    }
  }, [roomId]);

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
          {/* ── Firebase-not-configured warning ────────────────────────────── */}
          {!isFirebaseConfigured && lobbyState === 'IDLE' && (
            <View style={s.fbWarn}>
              <Text style={s.fbWarnTitle}>⚠️ משחק מרחוק כבוי</Text>
              <Text style={s.fbWarnBody}>
                משתני סביבה של Firebase חסרים. רק "משחק מקומי" יעבוד.
                {'\n'}הוסף EXPO_PUBLIC_FIREBASE_* ב-Vercel כדי להפעיל משחק בין שני מכשירים.
              </Text>
            </View>
          )}

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

                {/* Manual code entry — primary join path (US-006) */}
                <TextInput
                  style={s.joinCodeInput}
                  value={joinCodeInput}
                  onChangeText={(t) => setJoinCodeInput(t.toUpperCase())}
                  placeholder="קוד חדר"
                  placeholderTextColor="rgba(255,215,0,0.3)"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <TouchableOpacity style={s.secondaryBtn} onPress={handleManualJoin}>
                  <Text style={s.secondaryBtnText}>הצטרף עם קוד</Text>
                </TouchableOpacity>
              </View>

              {/* Demoted QR scan — hidden behind disclosure (US-007) */}
              <TouchableOpacity
                style={s.moreOptionsBtn}
                onPress={() => setShowMoreJoinOptions((v) => !v)}
              >
                <Text style={s.moreOptionsText}>
                  {showMoreJoinOptions ? 'הסתר אפשרויות ▴' : 'אפשרויות הצטרפות נוספות ▾'}
                </Text>
              </TouchableOpacity>
              {showMoreJoinOptions && (
                <TouchableOpacity style={s.qrScanBtn} onPress={handleStartScanning}>
                  <Text style={s.qrScanBtnText}>📷 סרוק QR</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.localBtn} onPress={startLocalGame}>
                <Text style={s.localBtnText}>משחק מקומי (שני שחקנים על מכשיר אחד)</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── HOSTING: Share invite + waiting ───────────────────────────── */}
          {lobbyState === 'HOSTING' && roomId && (
            <>
              <Text style={s.cardTitle}>ממתין ליריב...</Text>

              <TouchableOpacity style={s.shareBtn} onPress={handleShareInvite}>
                <Text style={s.shareBtnText}>📤 שתף הזמנה</Text>
              </TouchableOpacity>
              <Text style={s.shareHint}>שלח לחבר ב-WhatsApp / SMS / מייל</Text>

              <Text style={s.roomCodeLabel}>או תן לו את הקוד:</Text>
              <Text style={s.roomCode} selectable>{roomId}</Text>

              <ActivityIndicator color="#FFD700" style={{ marginTop: 16 }} />
              <Text style={s.waitText}>ממתין שהיריב יצטרף...</Text>

              {/* QR fallback — kept available, demoted via disclosure (US-007) */}
              <TouchableOpacity
                style={s.moreOptionsBtn}
                onPress={() => setShowQrFallback((v) => !v)}
              >
                <Text style={s.moreOptionsText}>
                  {showQrFallback ? 'הסתר QR ▴' : 'אפשרויות נוספות ▾'}
                </Text>
              </TouchableOpacity>
              {showQrFallback && (
                <View style={s.qrWrapper}>
                  <QRCode
                    value={`${QR_PREFIX}${roomId}`}
                    size={140}
                    backgroundColor="white"
                    color="#1A0D05"
                  />
                </View>
              )}

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

  // Share invite (US-004) + More-options disclosure (US-007)
  shareBtn: {
    backgroundColor: '#32CD32',
    width: '100%',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#32CD32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  shareBtnText: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  shareHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  roomCodeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 18,
    fontWeight: '600',
  },
  moreOptionsBtn: {
    marginTop: 14,
    paddingVertical: 6,
  },
  moreOptionsText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '600',
  },

  // Manual code input (US-006)
  joinCodeInput: {
    width: '100%',
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: '#FFD700',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Firebase-not-configured warning banner
  fbWarn: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,69,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,69,0,0.55)',
    marginBottom: 16,
  },
  fbWarnTitle: { color: '#FF4500', fontSize: 14, fontWeight: '900', marginBottom: 4 },
  fbWarnBody: { color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 18 },

  // Demoted QR scan button (US-007)
  qrScanBtn: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
    marginTop: 8,
  },
  qrScanBtnText: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 14 },

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
