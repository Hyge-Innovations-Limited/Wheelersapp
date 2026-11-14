import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import type { FeedPost } from '@/lib/feed';
import { theme } from '@/theme';

/**
 * ··· on a post. Someone else's: hide their posts, or report this one. Your
 * own: delete it.
 */
export function PostMenu({
  post,
  onClose,
  onHide,
  onReport,
  onDelete,
}: {
  post: FeedPost | null;
  onClose: () => void;
  onHide: (post: FeedPost) => void;
  onReport: (post: FeedPost) => void;
  onDelete: (post: FeedPost) => void;
}) {
  const first = post?.author.name.split(' ')[0] ?? '';
  return (
    <Modal animationType="slide" transparent visible={post !== null} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Close" style={styles.flex} onPress={onClose} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <OnLight>
            <View style={styles.grab} />
            {post?.mine ? (
              <Pressable accessibilityRole="button" onPress={() => post && onDelete(post)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <AppText variant="bodyMedium" color={theme.colors.danger}>Delete post</AppText>
              </Pressable>
            ) : (
              <>
                {post?.author.driverId ? (
                  <Pressable accessibilityRole="button" onPress={() => post && onHide(post)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                    <AppText variant="bodyMedium">Hide {first}&apos;s posts</AppText>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" onPress={() => post && onReport(post)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <AppText variant="bodyMedium" color={theme.colors.danger}>Report post</AppText>
                </Pressable>
              </>
            )}
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <AppText variant="bodyMedium" color={theme.colors.muted}>Cancel</AppText>
            </Pressable>
          </OnLight>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    paddingHorizontal: theme.spacing.gutter,
    paddingTop: 10,
    paddingBottom: theme.spacing.xxl,
    backgroundColor: theme.colors.offWhite,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
  },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 999, backgroundColor: '#CFC6B8', marginBottom: 8 },
  row: { minHeight: 50, justifyContent: 'center', paddingHorizontal: 4 },
  pressed: { opacity: 0.6 },
});
