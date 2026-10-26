import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Member, Message } from '@project-room/shared';
import { api } from '@/src/api/client';
import { EmptyState } from '@/src/components/EmptyState';
import { useWorkspace } from '@/src/state/workspace';
import { colors, radius, shadow } from '@/src/theme';

export default function ChatScreen() {
  const { projectId, snapshot, error, members, activeChannelId, setActiveChannelId, thread, loadMessages, applyRecord, reload } =
    useWorkspace();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const channelId = activeChannelId ?? snapshot?.channels.find((c) => c.name === 'general')?.id ?? snapshot?.channels[0]?.id ?? null;
  const channel = snapshot?.channels.find((c) => c.id === channelId);
  const current = channelId ? thread(channelId) : undefined;
  const list = current?.messages;
  const loaded = current?.loaded ?? false;

  useEffect(() => {
    if (!list?.length) return;
    listRef.current?.scrollToEnd({ animated: false });
  }, [list?.length, channelId]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !channelId || busy) return;
    setBusy(true);
    setSendError(null);
    try {
      const message = await api.sendMessage(projectId, channelId, trimmed);
      applyRecord('message', message);
      setText('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setBusy(false);
    }
  };

  let empty: string | undefined;
  if (!channel) empty = error ?? (snapshot ? 'No channel in this project.' : 'Loading channel…');
  else if (current?.error && !list?.length) empty = current.error;
  else if (!loaded && !list?.length) empty = 'Loading messages…';
  else if (loaded && !list?.length) empty = 'No messages yet.';

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {snapshot && snapshot.channels.length > 1 ? (
        <View style={styles.channels}>
          {snapshot.channels.map((ch) => {
            const active = ch.id === channelId;
            return (
              <Pressable key={ch.id} style={[styles.channelChip, active && styles.channelActive]} onPress={() => setActiveChannelId(ch.id)}>
                <Text style={[styles.channelText, active && styles.channelTextActive]}>#{ch.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.channelTitle}>
          <Text style={styles.channelTitleText}>#{channel?.name ?? 'channel'}</Text>
        </View>
      )}

      {current?.error && list?.length ? (
        <Pressable style={styles.banner} onPress={() => channelId && void loadMessages(channelId)}>
          <Text style={styles.bannerText}>{current.error} Tap to retry.</Text>
        </Pressable>
      ) : null}

      <FlatList
        ref={listRef}
        style={styles.list}
        data={list ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => {
          if (list?.length) listRef.current?.scrollToEnd({ animated: false });
        }}
        renderItem={({ item }) => <MessageRow message={item} members={members} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {!loaded && !current?.error && channel ? <ActivityIndicator color={colors.accent} /> : null}
            {loaded && !list?.length && !current?.error ? (
              <EmptyState
                title="Start the conversation"
                body="Say hello to the team, or type @AI plus a question to draft tasks and ideas for review in Assistant."
              />
            ) : (
              <>
                <Text style={styles.empty}>{empty}</Text>
                {(current?.error && channelId) || error ? (
                  <Pressable
                    style={styles.retry}
                    onPress={() => {
                      if (current?.error && channelId) void loadMessages(channelId);
                      else reload();
                    }}
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        }
      />

      {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}

      <View style={styles.composerWrap}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder={channel ? `Message #${channel.name}` : 'Loading…'}
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            editable={!!channelId && !busy}
          />
          <Pressable style={[styles.send, (!text.trim() || busy) && styles.sendDisabled]} onPress={() => void send()}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageRow({ message, members }: { message: Message; members: Map<string, Member> }) {
  const isAi = message.authorId === 'ai';
  const member = isAi ? undefined : members.get(message.authorId);
  const author = isAi ? 'AI' : (member?.name ?? message.authorId);
  const authorColor = isAi ? colors.accent : (member?.color ?? colors.ink);
  return (
    <View style={styles.msg}>
      <Text style={[styles.author, { color: authorColor }]}>{author}</Text>
      <Text style={styles.body}>{message.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  channels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  channelChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  channelActive: { backgroundColor: colors.accentWeak, borderColor: colors.accent },
  channelText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },
  channelTextActive: { color: colors.accent, fontWeight: '600' },
  channelTitle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  channelTitleText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  bannerText: { color: colors.ink2, fontSize: 13 },
  list: { flex: 1, backgroundColor: colors.surface },
  messages: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  emptyWrap: { alignItems: 'center', gap: 12, marginTop: 40 },
  empty: { textAlign: 'center', color: colors.muted, fontSize: 13 },
  retry: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  retryText: { color: colors.white, fontWeight: '600', fontSize: 13 },
  msg: { marginBottom: 10 },
  author: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  body: { fontSize: 14, lineHeight: 20, color: colors.ink },
  sendError: { color: colors.red, fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 },
  composerWrap: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8, backgroundColor: colors.surface },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  input: { flex: 1, minHeight: 32, fontSize: 14, color: colors.ink, paddingVertical: 6 },
  send: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: colors.white, fontWeight: '600', fontSize: 13 },
});
