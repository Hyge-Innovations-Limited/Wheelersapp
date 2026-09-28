import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { theme } from '@/theme';

type ChatComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend?: () => void;
  /** Off when the chat has closed. */
  editable?: boolean;
  placeholder?: string;
  maxLength?: number;
};

export function ChatComposer({ value, onChangeText, onSend, editable = true, placeholder = 'Type a message...', maxLength = 1000 }: ChatComposerProps) {
  const canSend = editable && value.trim().length > 0;
  return (
    <View style={styles.wrap}>
      <View style={[styles.inputWrap, !editable && styles.inputOff]}>
        <TextInput
          editable={editable}
          maxLength={maxLength}
          multiline
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#C9C1BA"
          style={styles.input}
          value={value}
        />
      </View>
      <Pressable
        accessibilityLabel="Send"
        disabled={!canSend}
        onPress={onSend}
        style={[styles.sendButton, !canSend && styles.sendOff]}>
        <AppText variant="h3" color={theme.colors.white}>
          ↗
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.gutter,
    paddingVertical: theme.spacing.md,
    borderTopWidth: theme.borders.thick,
    borderTopColor: theme.colors.black,
    backgroundColor: theme.colors.offWhite,
  },
  inputWrap: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  inputOff: {
    backgroundColor: theme.colors.offWhite,
  },
  input: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.black,
    maxHeight: 116,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: theme.radii.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.black,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.card,
  },
  sendOff: {
    opacity: 0.45,
  },
});
