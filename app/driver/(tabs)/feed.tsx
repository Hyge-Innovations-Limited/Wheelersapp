import { Href, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { AppText } from '@/components/app-text';
import { PostCard } from '@/components/feed/post-card';
import { PostMenu } from '@/components/feed/post-menu';
import { RequestBanner } from '@/components/feed/request-banner';
import { FeedSkeleton } from '@/components/feed/skeleton';
import { getAccessTokenWithRetry } from '@/lib/access-token';
import { useAuth } from '@/lib/auth';
import { useDriverSession } from '@/lib/driver-session';
import { appendPage, withLike, withLikeCount, type FeedFilter, type FeedPost } from '@/lib/feed';
import { deletePost, getFeed, hideDriver, reportPost, setLike, takeFeedChanged } from '@/lib/feed-api';
import { toUserMessage } from '@/lib/error-messages';
import { useAppTheme } from '@/lib/theme-context';
import { theme } from '@/theme';

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'alerts', label: 'Road alerts' },
  { key: 'wheelers', label: 'Wheelers' },
];

function PlusIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.colors.white} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/**
 * The Feed (driver app's first tab, 14 Nov 2026): drivers' posts an admin has
 * approved and Wheelers' own, newest first; your own posts still waiting sit
 * on top, marked. Likes only, no comments. A ride request that comes in while
 * reading shows as a banner (requests live on Drive).
 */
export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppTheme();
  const { getAccessToken } = useAuth();
  const { session } = useDriverSession();
  const isOnline = session.status !== 'offline';

  const [filter, setFilter] = useState<FeedFilter>('all');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [canPost, setCanPost] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuPost, setMenuPost] = useState<FeedPost | null>(null);
  const [now, setNow] = useState(Date.now());
  const loadId = useRef(0);
  const loadedOnce = useRef(false);

  const token = useCallback(() => getAccessTokenWithRetry(getAccessToken), [getAccessToken]);

  const load = useCallback(async (mode: 'first' | 'refresh') => {
    const id = ++loadId.current;
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const page = await getFeed(await token(), filter, null);
      if (id !== loadId.current) return;
      setPosts(page.posts);
      setCursor(page.nextCursor);
      setCanPost(page.canPost !== false);
      setError(null);
      setNow(Date.now());
      loadedOnce.current = true;
    } catch (failure) {
      if (id === loadId.current) setError(toUserMessage(failure, "Couldn't load the Feed."));
    } finally {
      if (id === loadId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [filter, token]);

  // A new filter starts again from the top, with the skeleton.
  useEffect(() => { setPosts([]); void load('first'); }, [load]);

  // Back from New post (or after a delete in My posts): reload. Otherwise
  // refresh the times shown.
  useFocusEffect(useCallback(() => {
    if (takeFeedChanged() && loadedOnce.current) void load('refresh');
    else setNow(Date.now());
  }, [load]));

  const loadMore = useCallback(async () => {
    if (!cursor || more || loading) return;
    setMore(true);
    const id = loadId.current;
    try {
      const page = await getFeed(await token(), filter, cursor);
      if (id !== loadId.current) return;
      setPosts((shown) => appendPage(shown, page.posts));
      setCursor(page.nextCursor);
    } catch {
      // The next scroll to the end tries again.
    } finally {
      setMore(false);
    }
  }, [cursor, filter, loading, more, token]);

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

  const onHide = useCallback(async (post: FeedPost) => {
    setMenuPost(null);
    if (!post.author.driverId) return;
    const driverId = post.author.driverId;
    try {
      await hideDriver(await token(), driverId);
      setPosts((shown) => shown.filter((p) => p.author.driverId !== driverId));
    } catch (failure) {
      Alert.alert('Not hidden', toUserMessage(failure, "Couldn't hide those posts. Try again."));
    }
  }, [token]);

  const onReport = useCallback((post: FeedPost) => {
    setMenuPost(null);
    const send = async (reason: string) => {
      try {
        await reportPost(await token(), post.id, reason);
        setPosts((shown) => shown.filter((p) => p.id !== post.id));
        Alert.alert('Reported', "Thanks. We'll look at it.");
      } catch (failure) {
        Alert.alert('Not reported', toUserMessage(failure, "Couldn't report it. Try again."));
      }
    };
    Alert.alert('Report post', 'What is wrong with it?', [
      { text: 'Rude or offensive', onPress: () => void send('Rude or offensive') },
      { text: 'False or misleading', onPress: () => void send('False or misleading') },
      { text: 'Spam or advert', onPress: () => void send('Spam or advert') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
          } catch (failure) {
            Alert.alert('Not deleted', toUserMessage(failure, "Couldn't delete it. Try again."));
          }
        },
      },
    ]);
  }, [token]);

  const newPost = () => {
    if (!canPost) {
      Alert.alert("You can't post yet", 'Posting opens once your account is approved.');
      return;
    }
    router.push('/driver/new-post' as Href);
  };

  const bg = isDark ? theme.colors.black : theme.colors.offWhite;
  const chipBg = isDark ? theme.colors.darkSurface : theme.colors.white;
  const chipBorder = isDark ? theme.colors.darkBorder : theme.colors.borderLight;

  const header = (
    <View style={styles.headerWrap}>
      <View style={styles.top}>
        <AppText variant="h1" numberOfLines={1}>Feed</AppText>
        <View style={styles.topRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isOnline ? 'Online. Open Drive' : 'Offline. Open Drive'}
            onPress={() => router.navigate('/driver/(tabs)/home' as Href)}
            style={[styles.pill, isOnline ? styles.pillOn : { backgroundColor: chipBg, borderColor: chipBorder }]}>
            <View style={[styles.pillDot, { backgroundColor: isOnline ? theme.colors.green : theme.colors.mutedLight }]} />
            <AppText variant="label" color={isOnline ? '#00875F' : theme.colors.muted}>{isOnline ? 'Online' : 'Offline'}</AppText>
          </Pressable>
          <Pressable accessibilityLabel="New post" accessibilityRole="button" onPress={newPost} style={({ pressed }) => [styles.plus, isDark && { backgroundColor: theme.colors.orange }, pressed && { opacity: 0.8 }]}>
            <PlusIcon />
          </Pressable>
        </View>
      </View>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, { backgroundColor: chipBg, borderColor: chipBorder }, on && styles.chipOn]}>
              <AppText variant="bodySmall" color={on ? theme.colors.white : theme.colors.muted} style={styles.chipText}>{f.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      <RequestBanner />
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
      <FlatList
        data={loading && posts.length === 0 ? [] : posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} now={now} onLike={onLike} onMore={setMenuPost} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? <FeedSkeleton /> : error ? (
            <View style={styles.empty}>
              <AppText variant="body" color={theme.colors.muted} style={styles.center}>{error}</AppText>
              <Pressable accessibilityRole="button" onPress={() => void load('first')} style={styles.retry}>
                <AppText variant="label">Try again</AppText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <AppText variant="body" color={theme.colors.muted} style={styles.center}>
                {filter === 'alerts' ? 'No road alerts right now.' : 'No posts yet.'}
              </AppText>
            </View>
          )
        }
        ListFooterComponent={more ? <FeedSkeleton count={1} /> : null}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={styles.list}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load('refresh')} tintColor={theme.colors.orange} colors={[theme.colors.orange]} />}
        showsVerticalScrollIndicator={false}
      />
      <PostMenu post={menuPost} onClose={() => setMenuPost(null)} onHide={onHide} onReport={onReport} onDelete={onDelete} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  headerWrap: { gap: 12, paddingTop: 6, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  pillOn: { borderColor: theme.colors.green, backgroundColor: theme.colors.successLight },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.black, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: theme.colors.black, borderColor: theme.colors.black },
  chipText: { fontFamily: 'HankenGrotesk_600SemiBold' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 48 },
  center: { textAlign: 'center' },
  retry: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: theme.radii.sm, backgroundColor: theme.colors.orange },
});
