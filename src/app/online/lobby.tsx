/**
 * online/lobby.tsx — the room lobby.
 *
 * Big room code (Copy / Share), a mini table with the four seats (you are at
 * the bottom), team colours, host crown and connection dots. Players tap an
 * empty seat to sit; the host can add/remove bots and starts the game when
 * every seat is filled. Moves on to the table as soon as the game starts.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GlassPanel } from '@/components/GlassPanel';
import { LottieAnim } from '@/components/LottieAnim';
import { ConnectionDot } from '@/components/ConnectionDot';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useToast } from '@/components/Toast';
import type { Seat } from '@/game/types';
import { useLayout } from '@/hooks/useLayout';
import { useOnline } from '@/online/OnlineRoomProvider';
import { allSeatsFilled, isSeatOpen } from '@/online/protocol';
import { colors, gradients, radii, spacing, typography } from '@/theme/theme';

/** Where each seat sits on screen, relative to me (0 = bottom, clockwise). */
const POSITION = ['bottom', 'left', 'top', 'right'] as const;

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const { contentWidth } = useLayout();
  const toast = useToast();
  const o = useOnline();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const room = o.room;

  // No room (e.g. app reopened on this route) → back to the online menu.
  useEffect(() => {
    if (!o.roomCode) router.replace('/online/menu');
  }, [o.roomCode]);

  // The game started → go to the table.
  useEffect(() => {
    if (room && (room.status === 'playing' || room.status === 'handOver')) router.replace('/online/game');
  }, [room]);

  // Android back → ask before leaving.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setConfirmLeave(true);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const leave = async () => {
    setConfirmLeave(false);
    await o.leaveRoom();
    router.replace('/');
  };

  if (!o.roomCode || !room) {
    return (
      <LinearGradient colors={gradients.room} style={[styles.screen, styles.center]}>
        <LottieAnim name="loading" style={{ width: 100, height: 100 }} />
        <Text style={[typography.body, { color: colors.textMuted }]}>Opening the room…</Text>
      </LinearGradient>
    );
  }

  const me = o.mySeat ?? 0;
  const relative = (seat: number) => POSITION[(seat - me + 4) % 4];
  const filled = allSeatsFilled(room.seats);

  const copy = async () => {
    await Clipboard.setStringAsync(o.roomCode!);
    toast.show('Room code copied', 'success');
  };
  const share = () =>
    Share.share({ message: `Join my Rang game! Open the app → Play Online → Join Room and enter the code: ${o.roomCode}` }).catch(
      () => undefined,
    );

  return (
    <LinearGradient colors={gradients.room} style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <ScrollView contentContainerStyle={[styles.content, { width: contentWidth, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.header}>
          <Text style={[typography.title, { color: colors.ivory }]}>Room lobby</Text>
          <ConnectionDot synced={o.synced} online={o.online} />
        </View>
        {!o.online && <OfflineBanner message="You are offline — the room will update when you reconnect." />}

        <GlassPanel style={styles.codePanel}>
          <Text style={[typography.micro, { color: colors.gold }]}>Room code</Text>
          <Text style={styles.code} selectable accessibilityLabel={`Room code ${[...o.roomCode].join(' ')}`}>
            {o.roomCode}
          </Text>
          <View style={styles.row}>
            <AppButton label="Copy" icon="content-copy" variant="secondary" size="sm" onPress={copy} style={styles.flex} />
            <AppButton label="Share" icon="share-variant" variant="secondary" size="sm" onPress={share} style={styles.flex} />
          </View>
        </GlassPanel>

        {/* Mini table with the four seats */}
        <View style={styles.table}>
          <LinearGradient colors={gradients.felt} style={styles.felt}>
            <Text style={styles.feltText}>RANG</Text>
          </LinearGradient>
          {room.seats.map((seat, i) => (
            <View key={i} style={[styles.seatSlot, slotStyle(relative(i))]}>
              <SeatTile
                index={i as Seat}
                name={seat.name}
                isBot={seat.isBot}
                isMe={seat.uid !== null && seat.uid === o.uid}
                isHost={seat.uid !== null && seat.uid === room.hostUid}
                open={isSeatOpen(seat)}
                connected={seat.isBot || (seat.uid !== null && (seat.uid === o.uid || o.connected(seat.uid)))}
                canHostEdit={o.isHost}
                onSit={() => o.takeSeat(i)}
                onAddBot={() => o.addBot(i)}
                onRemoveBot={() => o.removeBot(i)}
              />
            </View>
          ))}
        </View>
        <Text style={[typography.caption, styles.hint]}>
          Partners sit opposite each other ({teamText('A')} vs {teamText('B')}).{' '}
          {o.mySeat === null ? 'Tap an empty seat to sit down.' : 'Tap another empty seat to move.'}
        </Text>

        {o.isHost ? (
          <AppButton
            label={filled ? 'Start Game' : 'Fill every seat to start'}
            icon="play"
            size="lg"
            disabled={!filled || o.mySeat === null}
            onPress={o.startGame}
          />
        ) : (
          <View style={styles.waiting}>
            <LottieAnim name="loading" style={{ width: 40, height: 40 }} />
            <Text style={[typography.label, { color: colors.textMuted }]}>Waiting for {room.hostName} to start the game…</Text>
          </View>
        )}
        <AppButton label="Leave Room" icon="exit-run" variant="ghost" onPress={() => setConfirmLeave(true)} />
      </ScrollView>

      {confirmLeave && (
        <ConfirmDialog
          title="Leave the room?"
          message={o.isHost ? 'You are the host — the room will close for everyone.' : 'You can rejoin with the same code while the room is open.'}
          confirmLabel="Leave"
          danger
          onCancel={() => setConfirmLeave(false)}
          onConfirm={leave}
        />
      )}
      {o.closedReason && (
        <ConfirmDialog
          title="Room closed"
          message={o.closedReason}
          confirmLabel="Back to Home"
          onCancel={leave}
          onConfirm={leave}
        />
      )}
    </LinearGradient>
  );
}

const teamText = (team: 'A' | 'B') => (team === 'A' ? 'teal' : 'coral');

function slotStyle(pos: (typeof POSITION)[number]) {
  switch (pos) {
    case 'bottom':
      return { bottom: 0, left: 0, right: 0, alignItems: 'center' as const };
    case 'top':
      return { top: 0, left: 0, right: 0, alignItems: 'center' as const };
    case 'left':
      return { left: 0, top: 118 };
    case 'right':
      return { right: 0, top: 118 };
  }
}

interface TileProps {
  index: Seat;
  name: string;
  isBot: boolean;
  isMe: boolean;
  isHost: boolean;
  open: boolean;
  connected: boolean;
  canHostEdit: boolean;
  onSit: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
}

function SeatTile({ index, name, isBot, isMe, isHost, open, connected, canHostEdit, onSit, onAddBot, onRemoveBot }: TileProps) {
  const teamColor = index % 2 === 0 ? colors.teamA : colors.teamB;
  if (open) {
    return (
      <View style={[styles.tile, styles.tileOpen, { borderColor: teamColor }]}>
        <Pressable onPress={onSit} accessibilityRole="button" accessibilityLabel={`Sit in seat ${index + 1}`} style={styles.tileTap}>
          <MaterialCommunityIcons name="account-plus" size={22} color={teamColor} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>Empty — tap to sit</Text>
        </Pressable>
        {canHostEdit && (
          <Pressable onPress={onAddBot} accessibilityRole="button" accessibilityLabel={`Add a bot to seat ${index + 1}`} style={styles.botBtn} hitSlop={6}>
            <MaterialCommunityIcons name="robot" size={14} color={colors.textOnGold} />
            <Text style={[typography.micro, { color: colors.textOnGold }]}>Add bot</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return (
    <View
      style={[styles.tile, { borderColor: teamColor }, isMe && styles.tileMe]}
      accessible
      accessibilityLabel={`${name}${isMe ? ' (you)' : ''}${isHost ? ', host' : ''}${isBot ? ', bot' : ''}, ${connected ? 'connected' : 'disconnected'}`}>
      <View style={styles.tileRow}>
        {isHost && <MaterialCommunityIcons name="crown" size={14} color={colors.goldLight} />}
        {isBot && <MaterialCommunityIcons name="robot" size={14} color={colors.textMuted} />}
        <Text numberOfLines={1} style={[typography.label, { color: colors.ivory, maxWidth: 96 }]}>
          {isMe ? `${name} (you)` : name}
        </Text>
      </View>
      <View style={styles.tileRow}>
        <View style={[styles.connDot, { backgroundColor: connected ? colors.success : colors.textDim }]} />
        <Text style={[typography.caption, { color: colors.textMuted }]}>{isBot ? 'Bot' : connected ? 'Online' : 'Away'}</Text>
      </View>
      {canHostEdit && isBot && (
        <Pressable onPress={onRemoveBot} accessibilityRole="button" accessibilityLabel={`Remove the bot from seat ${index + 1}`} hitSlop={8} style={styles.removeBot}>
          <MaterialCommunityIcons name="close-circle-outline" size={18} color={colors.danger} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  center: { justifyContent: 'center', gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  codePanel: { alignItems: 'center', gap: spacing.sm },
  code: { color: colors.goldLight, fontSize: 44, fontWeight: '800', letterSpacing: 10 },
  row: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' },
  flex: { flex: 1 },
  table: { height: 330, justifyContent: 'center', alignItems: 'center' },
  felt: {
    width: '58%',
    height: 150,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: colors.goldDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feltText: { color: 'rgba(217,182,93,0.25)', fontSize: 28, fontWeight: '700', letterSpacing: 8 },
  seatSlot: { position: 'absolute' },
  tile: {
    width: 128,
    minHeight: 64,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1.5,
    backgroundColor: colors.glassStrong,
    gap: 4,
    justifyContent: 'center',
  },
  tileOpen: { borderStyle: 'dashed' },
  tileMe: { backgroundColor: 'rgba(217,182,93,0.12)' },
  tileTap: { alignItems: 'center', gap: 2 },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  botBtn: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  removeBot: { position: 'absolute', top: 4, right: 4 },
  hint: { color: colors.textMuted, textAlign: 'center' },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  connDot: { width: 8, height: 8, borderRadius: 4 },
});
