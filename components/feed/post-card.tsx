import { memo, useState } from 'react';
import { Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AppText, OnLight } from '@/components/app-text';
import { photoHeight, timeAgo, type FeedPost } from '@/lib/feed';
import { theme } from '@/theme';

function HeartIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? theme.colors.orange : 'none'} stroke={filled ? theme.colors.orange : theme.colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </Svg>
  );
}

/** One post: who, when, the words, the photos, the like. No comments, by design. */
export const PostCard = memo(function PostCard({
  post,
  now,
  onLike,
  onMore,
}: {
  post: FeedPost;
  now: number;
  onLike?: (post: FeedPost) => void;
  onMore?: (post: FeedPost) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const wheelers = post.kind === 'wheelers';
  const tag = post.pinned ? 'PINNED' : post.kind === 'road_alert' ? 'ROAD ALERT' : null;
  const live = post.status === 'live';

  return (
    <View style={[styles.card, post.status === 'waiting' && styles.cardWaiting]}>
      <OnLight>
        <View style={styles.head}>
          <View style={[styles.avatar, wheelers && styles.avatarWheelers]}>
            <AppText variant="label" color={theme.colors.orange}>{post.author.initials}</AppText>
          </View>
          <View style={styles.who}>
            <View style={styles.nameRow}>
              <AppText variant="bodyMedium" numberOfLines={1} style={styles.name}>{post.author.name}</AppText>
              {tag ? (
                <View style={[styles.tag, post.kind === 'road_alert' && !post.pinned && styles.tagAlert]}>
                  <AppText style={[styles.tagText, { color: post.kind === 'road_alert' && !post.pinned ? theme.colors.danger : '#B35300' }]}>{tag}</AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="bodySmall" color={theme.colors.muted} numberOfLines={1}>{timeAgo(post.at, now)}</AppText>
          </View>
          {onMore && !wheelers ? (
            <Pressable accessibilityLabel="More" accessibilityRole="button" hitSlop={12} onPress={() => onMore(post)} style={styles.more}>
              <AppText variant="bodyMedium" color={theme.colors.mutedLight}>···</AppText>
            </Pressable>
          ) : null}
        </View>

        {post.status === 'waiting' ? (
          <AppText variant="bodySmall" color="#B35300" style={styles.state}>Waiting for approval</AppText>
        ) : post.status === 'rejected' ? (
          <AppText variant="bodySmall" color={theme.colors.danger} style={styles.state}>
            Not approved{post.rejectionReason ? `: ${post.rejectionReason}` : ''}
          </AppText>
        ) : null}

        {post.text ? <AppText variant="body" style={styles.text}>{post.text}</AppText> : null}

        {post.photos.length > 0 ? (
          <View onLayout={onLayout} style={styles.photos}>
            {width > 0
              ? post.photos.map((photo, i) => {
                  // One photo full width; two or more in two columns.
                  const w = post.photos.length === 1 ? width : (width - 6) / 2;
                  const h = post.photos.length === 1 ? photoHeight(photo, width) : w;
                  return (
                    <Image
                      key={photo.url}
                      accessibilityIgnoresInvertColors
                      accessibilityLabel={`Photo ${i + 1}`}
                      resizeMode="cover"
                      source={{ uri: photo.url }}
                      style={[styles.photo, { width: w, height: h }]}
                    />
                  );
                })
              : null}
          </View>
        ) : null}

        {live && onLike ? (
          <View style={styles.foot}>
            <Pressable
              accessibilityLabel={post.liked ? `Unlike, ${post.likeCount} likes` : `Like, ${post.likeCount} likes`}
              accessibilityRole="button"
              accessibilityState={{ selected: post.liked }}
              hitSlop={6}
              onPress={() => onLike(post)}
              style={({ pressed }) => [styles.like, post.liked && styles.likeOn, pressed && { opacity: 0.7 }]}>
              <HeartIcon filled={post.liked} />
              <AppText variant="bodySmall" color={post.liked ? '#B35300' : theme.colors.black} style={styles.likeText}>{post.likeCount}</AppText>
            </Pressable>
          </View>
        ) : null}
      </OnLight>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 12,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.white,
  },
  cardWaiting: { borderStyle: 'dashed', borderColor: '#E8B98A' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orangeLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWheelers: { backgroundColor: theme.colors.black },
  who: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.colors.orangeLight },
  tagAlert: { backgroundColor: theme.colors.dangerLight },
  tagText: { fontFamily: 'HankenGrotesk_700Bold', fontSize: 10, lineHeight: 13, letterSpacing: 0.3 },
  more: { paddingHorizontal: 4 },
  state: { fontFamily: 'HankenGrotesk_600SemiBold' },
  text: { fontSize: 14, lineHeight: 20 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photo: { borderRadius: theme.radii.sm, backgroundColor: '#EFEAE1' },
  foot: { flexDirection: 'row' },
  like: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingLeft: 8,
    paddingRight: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  likeOn: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orangeLight },
  likeText: { fontFamily: 'HankenGrotesk_600SemiBold', fontVariant: ['tabular-nums'] },
});
