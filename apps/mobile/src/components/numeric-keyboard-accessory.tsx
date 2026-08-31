import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { font, useFlowndTheme } from '@/components/flownd-ui';

export const NUMERIC_KEYBOARD_ACCESSORY_ID = 'flownd-numeric-keyboard-accessory';

export function NumericKeyboardAccessory() {
  const { colors } = useFlowndTheme();
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={NUMERIC_KEYBOARD_ACCESSORY_ID}>
      <View
        style={[
          styles.toolbar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi tastiera"
          hitSlop={6}
          onPress={Keyboard.dismiss}
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: colors.accentSoft },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.doneText, { color: colors.accent }]}>Fine</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 7,
    paddingRight: 14,
    paddingBottom: 7,
    paddingLeft: 14,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  doneButton: {
    minWidth: 62,
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontFamily: font.bodySemiBold, fontSize: 13 },
  pressed: { opacity: 0.68 },
});
