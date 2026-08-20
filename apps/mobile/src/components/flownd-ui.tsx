import {
  createContext,
  PropsWithChildren,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import {
  font,
  lightColors,
  radius,
  useFlowndTheme,
} from '@/constants/flownd-theme';

const gradientStops = Array.from({ length: 32 }, (_, index) => {
  const ratio = index / 31;
  const from = [0x45, 0x7f, 0xef];
  const to = [0x45, 0xd5, 0xb6];
  const channels = from.map((channel, channelIndex) =>
    Math.round(channel + (to[channelIndex] - channel) * ratio),
  );
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
});

type ScrollHeaderContextValue = {
  scrollY: Animated.Value;
  headerProgress: Animated.Value;
  scrollsWithContent: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

const ScrollHeaderContext = createContext<ScrollHeaderContextValue | null>(null);

// Alias mantenuto per i componenti ancora in migrazione.
export const palette = {
  background: lightColors.background,
  surface: lightColors.surface,
  ink: lightColors.text,
  muted: lightColors.textSecondary,
  teal: lightColors.accent,
  tealSoft: lightColors.accentSoft,
  navy: lightColors.accent,
  line: lightColors.border,
  warning: lightColors.warning,
  blue: '#457FEF',
};

export { font, useFlowndTheme };

export function Screen({
  children,
  scroll = true,
  scrollHeaderWithContent = false,
  style,
  floatingAction,
  floatingActionPosition = 'right',
}: PropsWithChildren<{
  scroll?: boolean;
  scrollHeaderWithContent?: boolean;
  style?: StyleProp<ViewStyle>;
  floatingAction?: ReactNode;
  floatingActionPosition?: 'right' | 'center';
}>) {
  const { colors } = useFlowndTheme();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerProgress] = useState(() => new Animated.Value(0));
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const onScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: true,
          listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const offset = event.nativeEvent.contentOffset.y;
            setHeaderCollapsed((current) => {
              if (offset >= 14) return true;
              if (offset <= 4) return false;
              return current;
            });
          },
        },
      ),
    [scrollY],
  );
  useEffect(() => {
    const animation = Animated.timing(headerProgress, {
      toValue: headerCollapsed ? 1 : 0,
      duration: 120,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [headerCollapsed, headerProgress]);
  const headerContext = useMemo(
    () => ({
      scrollY,
      headerProgress,
      scrollsWithContent: scroll || scrollHeaderWithContent,
      onScroll,
    }),
    [headerProgress, onScroll, scroll, scrollHeaderWithContent, scrollY],
  );
  const content = <View style={[styles.screenContent, style]}>{children}</View>;
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollHeaderContext.Provider value={headerContext}>
        {scroll ? (
          <Animated.ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.scroll}>
            {content}
          </Animated.ScrollView>
        ) : (
          content
        )}
      </ScrollHeaderContext.Provider>
      {floatingAction ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.floatingAction,
            floatingActionPosition === 'center' && styles.floatingActionCenter,
          ]}>
          {floatingAction}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function useScreenScrollHandler() {
  return useContext(ScrollHeaderContext)?.onScroll;
}

export function ScreenScrollBridge({
  children,
}: {
  children: (
    onScroll: ScrollHeaderContextValue['onScroll'] | undefined,
  ) => ReactNode;
}) {
  return children(useScreenScrollHandler());
}

export function LoadingScreen({ label }: { label: string }) {
  const { colors } = useFlowndTheme();
  return (
    <SafeAreaView style={[styles.loading, { backgroundColor: colors.background }]}>
      <BrandLogo size={56} style={styles.loadingMark} />
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{label}</Text>
    </SafeAreaView>
  );
}

export function ProgressHeader({
  step,
  title,
  total = 6,
  onBack,
  showCount = true,
}: {
  step: number;
  title: string;
  total?: number;
  onBack?: () => void;
  showCount?: boolean;
}) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.progressHeader}>
      <View style={styles.progressCopy}>
        <View style={styles.progressTitleRow}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Torna indietro"
              hitSlop={10}
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
              <Text style={[styles.backIcon, { color: colors.accent }]}>‹</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.progressLabel, { color: colors.accent }]}>{title}</Text>
        </View>
        {showCount ? (
          <Text style={[styles.progressCount, { color: colors.textSecondary }]}>
            {step} di {total}
          </Text>
        ) : null}
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.sunken }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.accent, width: `${Math.round((step / total) * 100)}%` },
          ]}
        />
      </View>
    </View>
  );
}

type ButtonProps = PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
}>;

export function PrimaryButton({ children, onPress, disabled, loading, compact }: ButtonProps) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compactButton,
        { backgroundColor: colors.accent },
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={[styles.primaryText, { color: colors.onAccent }]}>{children}</Text>
      )}
    </Pressable>
  );
}

export function GradientButton({ children, onPress, disabled, loading }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.gradientPressable,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <View style={styles.gradient}>
        <View pointerEvents="none" style={styles.gradientBackdrop}>
          {gradientStops.map((backgroundColor, index) => (
            <View key={index} style={[styles.gradientStop, { backgroundColor }]} />
          ))}
        </View>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryText}>{children}</Text>
        )}
      </View>
    </Pressable>
  );
}

export function SecondaryButton({ children, onPress, disabled, compact }: ButtonProps) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compactButton,
        { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.secondaryText, { color: colors.text }]}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, suffix, ...props }: TextInputProps & { label: string; suffix?: string }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.accent}
          style={[styles.input, { color: colors.text }]}
          {...props}
        />
        {suffix ? <Text style={[styles.suffix, { color: colors.textSecondary }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors, isDark } = useFlowndTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        !isDark && styles.lightShadow,
        style,
      ]}>
      {children}
    </View>
  );
}

export function PageHeader({
  eyebrow,
  title,
  leading,
  action,
  collapseInPlace = false,
  compactBorderless = false,
}: {
  eyebrow?: string;
  title: string;
  leading?: ReactNode;
  action?: ReactNode;
  collapseInPlace?: boolean;
  compactBorderless?: boolean;
}) {
  const { colors } = useFlowndTheme();
  const scrollContext = useContext(ScrollHeaderContext);
  const originalOpacity = scrollContext
    ? scrollContext.headerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      })
    : 1;
  const originalTranslateY = scrollContext
    ? scrollContext.headerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -12],
      })
    : 0;
  const compactOpacity = scrollContext
    ? scrollContext.headerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      })
    : 0;
  const compactScale = scrollContext
    ? scrollContext.headerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.94, 1],
      })
    : 1;
  const compactTranslateY = scrollContext?.scrollsWithContent
    ? scrollContext.scrollY
    : 0;
  return (
    <View
      style={[
        styles.pageHeaderFrame,
        collapseInPlace && styles.pageHeaderFrameCollapseInPlace,
      ]}>
      <Animated.View
        style={[
          styles.pageHeader,
          {
            opacity: originalOpacity,
            transform: [{ translateY: originalTranslateY }],
          },
        ]}>
        {leading ? <View style={styles.pageHeaderLeading}>{leading}</View> : null}
        <View style={styles.flex}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text> : null}
          <Text style={[styles.pageTitle, { color: colors.text }]}>{title}</Text>
        </View>
      </Animated.View>
      {scrollContext ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.compactHeader,
            {
              backgroundColor: colors.background,
              borderBottomColor: colors.border,
              borderBottomWidth: compactBorderless
                ? 0
                : StyleSheet.hairlineWidth,
              elevation: compactBorderless ? 0 : 8,
              opacity: compactOpacity,
              transform: [
                { translateY: compactTranslateY },
                { scale: compactScale },
              ],
            },
          ]}>
          <Text style={[styles.compactHeaderTitle, { color: colors.text }]}>
            {title}
          </Text>
        </Animated.View>
      ) : null}
      {action ? (
        <Animated.View
          style={[
            styles.fixedHeaderAction,
            { transform: [{ translateY: compactTranslateY }] },
          ]}>
          {action}
        </Animated.View>
      ) : null}
      {leading ? (
        <Animated.View
          style={[
            styles.fixedHeaderLeading,
            {
              opacity: compactOpacity,
              transform: [{ translateY: compactTranslateY }],
            },
          ]}>
          {leading}
        </Animated.View>
      ) : null}
    </View>
  );
}

export function ProgressBar({ value, warning = false }: { value: number; warning?: boolean }) {
  const { colors } = useFlowndTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.sunken }]}>
      <View
        style={[
          styles.barFill,
          {
            backgroundColor: warning ? colors.warning : colors.accent,
            width: `${Math.min(100, Math.max(4, value * 100))}%`,
          },
        ]}
      />
    </View>
  );
}

export const uiStyles = StyleSheet.create({
  title: {
    fontFamily: font.displayBold,
    fontSize: 32,
    lineHeight: 42,
    letterSpacing: -0.5,
    paddingTop: 3,
  },
  subtitle: { fontFamily: font.body, fontSize: 16, lineHeight: 23, marginTop: 8 },
  sectionTitle: { fontFamily: font.displaySemiBold, fontSize: 20, lineHeight: 24, marginBottom: 12 },
  label: { fontFamily: font.bodySemiBold, fontSize: 12, letterSpacing: 0.4 },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  amount: { fontFamily: font.dataMedium, fontSize: 22, lineHeight: 28 },
  error: { fontFamily: font.body, fontSize: 13, lineHeight: 18, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1 },
  screenContent: { flex: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 },
  floatingAction: {
    position: 'absolute',
    right: 20,
    bottom: 112,
  },
  floatingActionCenter: { left: 20, alignItems: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingMark: { marginBottom: 6 },
  loadingText: { fontFamily: font.bodyMedium, fontSize: 14 },
  progressHeader: { marginBottom: 38 },
  progressCopy: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  progressTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontFamily: font.bodyMedium, fontSize: 28, lineHeight: 28, marginTop: -2 },
  progressLabel: { fontFamily: font.bodySemiBold, fontSize: 13 },
  progressCount: { fontFamily: font.dataMedium, fontSize: 11 },
  progressTrack: { height: 4, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  button: {
    minHeight: 50,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 14,
  },
  compactButton: { minHeight: 42, marginTop: 0 },
  gradientPressable: { minHeight: 52, marginTop: 18, borderRadius: radius.control, overflow: 'hidden' },
  gradient: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  gradientBackdrop: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  gradientStop: { flex: 1 },
  primaryText: { color: '#FFFFFF', fontFamily: font.bodySemiBold, fontSize: 16 },
  secondaryText: { fontFamily: font.bodySemiBold, fontSize: 15 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  fieldWrap: { marginTop: 16 },
  fieldLabel: { fontFamily: font.bodyMedium, fontSize: 13, marginBottom: 7 },
  field: {
    minHeight: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontFamily: font.body, fontSize: 16, paddingVertical: 13 },
  suffix: { fontFamily: font.bodyMedium, fontSize: 15 },
  card: { borderRadius: radius.card, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  lightShadow: {
    shadowColor: '#0B241B',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 1,
  },
  pageHeaderFrame: { minHeight: 45, marginBottom: 18, zIndex: 20 },
  pageHeaderFrameCollapseInPlace: { marginBottom: 0 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 45 },
  pageHeaderLeading: { marginRight: 8 },
  flex: { flex: 1 },
  eyebrow: { fontFamily: font.bodySemiBold, fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  pageTitle: {
    fontFamily: font.displayBold,
    fontSize: 26,
    lineHeight: 35,
    paddingTop: 2,
  },
  compactHeader: {
    position: 'absolute',
    top: -10,
    left: -20,
    right: -20,
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 8,
  },
  compactHeaderTitle: {
    fontFamily: font.displaySemiBold,
    fontSize: 17,
    lineHeight: 24,
    paddingTop: 1,
  },
  fixedHeaderAction: {
    position: 'absolute',
    right: 0,
    top: -10,
    height: 44,
    justifyContent: 'center',
    zIndex: 40,
    elevation: 9,
  },
  fixedHeaderLeading: {
    position: 'absolute',
    left: 0,
    top: -10,
    height: 44,
    justifyContent: 'center',
    zIndex: 40,
    elevation: 9,
  },
  bar: { height: 7, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7 },
});
