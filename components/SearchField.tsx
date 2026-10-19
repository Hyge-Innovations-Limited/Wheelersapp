import { StyleSheet, TextInput, View } from 'react-native';

import { AppText, OnLight } from '@/components/app-text';
import { theme } from '@/theme';

type SearchFieldProps = {
  placeholder: string;
  value?: string;
  onChangeText?: (text: string) => void;
  readOnly?: boolean;
};

export function SearchField({
  placeholder,
  value,
  onChangeText,
  readOnly,
}: SearchFieldProps) {
  return (
    <View style={styles.wrap}>
      <OnLight>
      <AppText variant="body">🔍</AppText>
      <TextInput
        editable={!readOnly}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#C9C1BA"
        style={styles.input}
        value={value}
      />
      </OnLight>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: theme.borders.thick,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.md,
    minHeight: 48,
    ...theme.shadows.card,
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.black,
  },
});
