import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { FlowHeader } from '@/components/flow-header';
import { PostCard } from '@/components/feed/post-card';
import { PostMenu } from '@/components/feed/post-menu';
import { FeedSkeleton } from '@/components/feed/skeleton';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { useAuth } from '@/lib/auth';
import { toUserMessage } from '@/lib/error-messages';
import { appendPage, withLike, withLikeCount, type FeedPost } from '@/lib/feed';
import { deletePost, getMyPosts, markFeedChanged, setLike } from '@/lib/feed-api';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

/** My posts (Me): everything I posted, waiting, live or not approved (and why). */
export default function MyPostsScreen() {
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const { getAccessToken } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuPost, setMenuPost] = useState<FeedPost | null>(null);
  const [now, setNow] = useState(Date.now());
  const loadId = useRef(0);
  const token = useCallback(() => getAccessTokenWithRetry(getAccessToken), [getAccessToken]);

  const load = useCallback(async (mode: 'first' | 'refresh') => {
    const id = ++loadId.current;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const page = await getMyPosts(await token(), null);
      if (id !== loadId.current) return;
      setPosts(page.posts);
      setCursor(page.nextCursor);
      setError(null);
      setNow(Date.now());
    } catch (failure) {
      if (id === loadId.current) setError(toUserMessage(failure, "Couldn't load your posts."));
    } finally {
      if (id === loadId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [token]);

  useEffect(() => { void load('first'); }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || more || loading) return;
    setMore(true);
    try {
      const page = await getMyPosts(await token(), cursor);
      setPosts((shown) => appendPage(shown, page.posts));
      setCursor(page.nextCursor);
    } catch { /* tried again at the next scroll */ } finally {
      setMore(false);
    }
  }, [cursor, loading, more, token]);

  const onLike = useCallback(async (post: FeedPost) => {
    const liked = !post.liked;
    setPosts((shown) => withLike(shown, post.id, liked));
    try {
      const answer = await setLike(await token(), post.id, liked);
      setPosts((shown) => withLikeCount(shown, post.id, answer.liked, answer.likeCount));
    } catch {
      setPosts((shown) => withLike(shown, post.id, !liked));
    }
  }, [token]);

  const onDelete = useCallback((post: FeedPost) => {
    setMenuPost(null);
    Alert.alert('Delete post?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(await token(), post.id);
            setPosts((shown) => shown.filter((p) => p.id !== post.id));
            markFeedChanged();
          } catch (failure) {
            Alert.alert('Not deleted', toUserMessage(failure, "Couldn't delete it. Try again."));
          }
        },
      },
    ]);
  }, [token]);

  return (
    <View style={[styles.screen, { backgroundColor: isDark ? theme.colors.black : theme.colors.offWhite, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <FlowHeader title="My posts" showBack backHref="/driver/(tabs)/settings" />
      </View>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} now={now} onLike={onLike} onMore={setMenuPost} />}
        ListEmptyComponent={
          loading ? <FeedSkeleton /> : error ? (
            <View style={styles.empty}>
              <AppText variant="body" color={theme.colors.muted} style={styles.center}>{error}</AppText>
              <Pressable accessibilityRole="button" onPress={() => { setLoading(true); void load('first'); }} style={styles.retry}>
                <AppText variant="label">Try again</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <AppText variant="body" color={theme.colors.muted} style={styles.center}>You haven&apos;t posted yet.</AppText>
            </View>
          )
        }
        ListFooterComponent={more ? <FeedSkeleton count={1} /> : null}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}
      />
      <PostMenu post={menuPost} onClose={() => setMenuPost(null)} onHide={() => setMenuPost(null)} onReport={() => setMenuPost(null)} onDelete={onDelete} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  center: { textAlign: 'center' },
  retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: theme.radii.sm, backgroundColor: theme.colors.orange },
});
