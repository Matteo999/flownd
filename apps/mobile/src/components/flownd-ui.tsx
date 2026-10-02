import {
  createContext,
  forwardRef,
  PropsWithChildren,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  type AccessibilityRole,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { type Href, router, useIsFocused } from 'expo-router';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { BrandLogo } from '@/components/brand-logo';
import {
  darkColors,
  font,
  lightColors,
  radius,
  useFlowndTheme,
} from '@/constants/flownd-theme';

type ScrollHeaderContextValue = {
  scrollY: Animated.Value;
  headerProgress: Animated.Value;
  scrollsWithContent: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

const ScrollHeaderContext = createContext<ScrollHeaderContextValue | null>(null);
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

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

// Sfumatura monocroma (opzione 2c): una sola tinta petrolio in alto che sfuma nel fondo.
const lightScreenGradient = ['#DAE8EA', '#EEF4F5', '#FFFFFF'] as const;
const darkScreenGradient = ['#153237', '#10252A', darkColors.background] as const;
const lightCompactHeaderBackground = '#DDEAEC';
// Maschera del contenuto sotto la barra fissa: invisibile dietro la status
// bar, poi opacità crescente (curva morbida) fin oltre la barra di navigazione.
const HEADER_FADE_EXTENT = 84;
const HEADER_FADE_MASK = [
  'rgba(0,0,0,0)',
  'rgba(0,0,0,0)',
  'rgba(0,0,0,0.07)',
  'rgba(0,0,0,0.27)',
  'rgba(0,0,0,0.55)',
  'rgba(0,0,0,0.8)',
  'rgba(0,0,0,0.95)',
  'rgba(0,0,0,1)',
] as const;
const darkCompactHeaderBackground = '#162B38';

export { font, useFlowndTheme };

export function Screen({
  children,
  scroll = true,
  scrollEnabled = true,
  scrollHeaderWithContent = false,
  animateFirstFocus = false,
  style,
  floatingAction,
  floatingActionPosition = 'right',
  fixedHeader,
  onScroll: onScreenScroll,
  transparentHeaderOnScroll = false,
  onRefresh,
}: PropsWithChildren<{
  scroll?: boolean;
  scrollEnabled?: boolean;
  scrollHeaderWithContent?: boolean;
  animateFirstFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  floatingAction?: ReactNode;
  floatingActionPosition?: 'right' | 'center' | 'free';
  fixedHeader?: ReactNode;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  transparentHeaderOnScroll?: boolean;
  // Abilita il pull-to-refresh sulla ScrollView della schermata.
  onRefresh?: () => Promise<unknown>;
}>) {
  const { colors, isDark } = useFlowndTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerProgress] = useState(() => new Animated.Value(0));
  const [firstFocusProgress] = useState(
    () => new Animated.Value(animateFirstFocus ? 0 : 1),
  );
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const firstFocusRevealed = useRef(!animateFirstFocus);
  const handleScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
          useNativeDriver: true,
          listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const offset = event.nativeEvent.contentOffset.y;
            onScreenScroll?.(event);
            setHeaderCollapsed((current) => {
              if (offset >= 14) return true;
              if (offset <= 4) return false;
              return current;
            });
          },
        },
      ),
    [onScreenScroll, scrollY],
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
  useEffect(() => {
    if (!animateFirstFocus || !isFocused || firstFocusRevealed.current) return;
    firstFocusRevealed.current = true;
    const animation = Animated.timing(firstFocusProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [animateFirstFocus, firstFocusProgress, isFocused]);
  const headerContext = useMemo(
    () => ({
      scrollY,
      headerProgress,
      scrollsWithContent: scroll || scrollHeaderWithContent,
      onScroll: handleScroll,
    }),
    [handleScroll, headerProgress, scroll, scrollHeaderWithContent, scrollY],
  );
  const content = (
    <View
      style={[
        styles.screenContent,
        transparentHeaderOnScroll && scroll && { paddingTop: insets.top + 10 },
        style,
      ]}>
      {children}
    </View>
  );
  const scrollView = (
    <Animated.ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEnabled={scrollEnabled}
      scrollEventThrottle={16}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        ) : undefined
      }
      contentContainerStyle={styles.scroll}>
      {content}
    </Animated.ScrollView>
  );
  return (
    <AnimatedSafeAreaView
      edges={transparentHeaderOnScroll ? ['left', 'right'] : ['top', 'left', 'right']}
      style={[
        styles.safe,
        { backgroundColor: colors.background },
      ]}>
      <LinearGradient
        colors={
          isDark
            ? darkScreenGradient
            : lightScreenGradient
        }
        end={{ x: 0.5, y: 1 }}
        locations={isDark ? [0, 0.3, 0.75] : [0, 0.3, 0.8]}
        pointerEvents="none"
        start={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {!transparentHeaderOnScroll ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.compactHeaderBackdrop,
            {
              backgroundColor: isDark
                ? darkCompactHeaderBackground
                : lightCompactHeaderBackground,
              height: insets.top,
              opacity: headerProgress,
            },
          ]}
        />
      ) : null}
      <ScrollHeaderContext.Provider value={headerContext}>
        {transparentHeaderOnScroll ? (
          // Scorrendo, il contenuto che passa sotto la barra sfuma in
          // trasparenza e lascia vedere lo sfondo reale: nessuna banda.
          <MaskedView
            style={styles.flex}
            maskElement={(
              <View style={StyleSheet.absoluteFill}>
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.maskSolid,
                    {
                      opacity: headerProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 0],
                      }),
                    },
                  ]}
                />
                <LinearGradient
                  colors={HEADER_FADE_MASK}
                  locations={HEADER_FADE_MASK.map((_, index) =>
                    index === 0
                      ? 0
                      : (insets.top
                          + (HEADER_FADE_EXTENT * (index - 1)) / (HEADER_FADE_MASK.length - 2))
                        / (insets.top + HEADER_FADE_EXTENT),
                  ) as unknown as readonly [number, number, ...number[]]}
                  style={{ height: insets.top + HEADER_FADE_EXTENT }}
                />
                <View style={[styles.flex, styles.maskSolid]} />
              </View>
            )}>
            {scroll ? scrollView : content}
          </MaskedView>
        ) : scroll ? (
          scrollView
        ) : (
          content
        )}
        {fixedHeader ? (
          <View
            pointerEvents="box-none"
            style={[styles.fixedScreenHeader, { top: insets.top + 3 }]}>
            {fixedHeader}
          </View>
        ) : null}
      </ScrollHeaderContext.Provider>
      {floatingAction ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.floatingAction,
            floatingActionPosition === 'center' && styles.floatingActionCenter,
            floatingActionPosition === 'free' && styles.floatingActionFree,
          ]}>
          {floatingAction}
        </View>
      ) : null}
      {animateFirstFocus ? (
        // Dissolvenza d'ingresso con una copertura che svanisce: un'opacità
        // animata sui contenitori impedirebbe a iOS di disegnare il vetro nativo.
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.firstFocusCover,
            {
              opacity: firstFocusProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            },
          ]}>
          <LinearGradient
            colors={isDark ? darkScreenGradient : lightScreenGradient}
            end={{ x: 0.5, y: 1 }}
            locations={isDark ? [0, 0.3, 0.75] : [0, 0.3, 0.8]}
            start={{ x: 0.5, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </AnimatedSafeAreaView>
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

export function StickyScrollHeader({
  accessibilityRole,
  children,
  matchCompactHeaderBackground = false,
  offset = 14,
  style,
}: PropsWithChildren<{
  accessibilityRole?: AccessibilityRole;
  matchCompactHeaderBackground?: boolean;
  offset?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  const { isDark } = useFlowndTheme();
  const scrollContext = useContext(ScrollHeaderContext);
  const translateY = scrollContext
    ? scrollContext.scrollY.interpolate({
        inputRange: [0, offset, offset + 1],
        outputRange: [0, 0, 1],
        extrapolateLeft: 'clamp',
        extrapolateRight: 'extend',
      })
    : 0;

  return (
    <Animated.View
      accessibilityRole={accessibilityRole}
      style={[
        style,
        scrollContext && { transform: [{ translateY }] },
      ]}>
      {matchCompactHeaderBackground && scrollContext ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark
                ? darkCompactHeaderBackground
                : lightCompactHeaderBackground,
              opacity: scrollContext.headerProgress,
            },
          ]}
        />
      ) : null}
      {children}
    </Animated.View>
  );
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
  icon?: string;
}>;

export function PrimaryButton({ children, onPress, disabled, loading, compact }: ButtonProps) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
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

export function GradientButton({ children, onPress, disabled, loading, compact, icon }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.gradientPressable,
        compact && styles.compactGradientPressable,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <LinearGradient
        colors={['#457FEF', '#45D5B6']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.gradient, compact && styles.compactGradient]}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.gradientContent}>
            {icon ? <Text style={styles.gradientIcon}>{icon}</Text> : null}
            <Text style={[styles.primaryText, compact && styles.compactGradientText]}>{children}</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function SecondaryButton({ children, onPress, disabled, compact }: ButtonProps) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
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

export const Field = forwardRef<TextInput, TextInputProps & { label: string; suffix?: string }>(function Field({
  label,
  suffix,
  keyboardAppearance,
  style,
  ...props
}, ref) {
  const { colors, isDark } = useFlowndTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.field, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TextInput
          ref={ref}
          keyboardAppearance={keyboardAppearance ?? (isDark ? 'dark' : 'light')}
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.accent}
          style={[styles.input, { color: colors.text }, style]}
          {...props}
        />
        {suffix ? <Text style={[styles.suffix, { color: colors.textSecondary }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
});

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

// Pulsante indietro standard (icona 40pt + hitSlop). Senza cronologia torna
// alla dashboard invece di non fare nulla.
export function BackButton({
  onPress,
  variant = 'plain',
  label = 'Torna indietro',
}: {
  onPress?: () => void;
  variant?: 'plain' | 'surface';
  label?: string;
}) {
  const { colors } = useFlowndTheme();
  const handlePress =
    onPress ??
    (() => {
      if (router.canGoBack()) router.back();
      else router.replace('/dashboard' as Href);
    });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.backIconButton,
        variant === 'surface' && {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
        },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.backIconGlyph, { color: colors.text }]}>arrow_back</Text>
    </Pressable>
  );
}

export function PageHeader({
  eyebrow,
  title,
  leading,
  action,
  collapseInPlace = false,
  compactBorderless = true,
  titleStyle,
}: {
  eyebrow?: string;
  title: string;
  leading?: ReactNode;
  action?: ReactNode;
  collapseInPlace?: boolean;
  compactBorderless?: boolean;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const { colors, isDark } = useFlowndTheme();
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
          <Text style={[styles.pageTitle, { color: colors.text }, titleStyle]}>{title}</Text>
        </View>
      </Animated.View>
      {scrollContext ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.compactHeader,
            {
              backgroundColor: isDark
                ? darkCompactHeaderBackground
                : lightCompactHeaderBackground,
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

// Superficie "liquid glass": GlassView nativo su iOS 26+, altrove un fondo
// traslucido che ne imita l'aspetto. Solo per i controlli, mai per le card.
export function GlassSurface({
  children,
  interactive = false,
  tintColor,
  style,
}: PropsWithChildren<{
  interactive?: boolean;
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
}>) {
  const { isDark } = useFlowndTheme();
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        colorScheme={isDark ? 'dark' : 'light'}
        glassEffectStyle="regular"
        isInteractive={interactive}
        tintColor={tintColor}
        style={style}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        styles.glassFallback,
        {
          backgroundColor: tintColor ?? (isDark ? 'rgba(23,33,28,0.82)' : 'rgba(255,255,255,0.66)'),
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
        },
        style,
      ]}>
      {children}
    </View>
  );
}

// Controllo segmentato in vetro con cursore animato. `progress` (indice
// frazionario) permette di legare il cursore a un gesto, es. lo swipe tra pagine.
export function GlassSegmentedControl({
  options,
  selectedIndex,
  onChange,
  progress,
  fontSize = 12,
  style,
}: {
  options: { id: string; label: string; accessibilityLabel?: string }[];
  selectedIndex: number;
  onChange: (index: number) => void;
  progress?: SharedValue<number>;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useFlowndTheme();
  const [width, setWidth] = useState(0);
  const internalProgress = useSharedValue(selectedIndex);
  useEffect(() => {
    internalProgress.value = withSpring(selectedIndex, {
      damping: 20,
      stiffness: 260,
      mass: 0.8,
    });
  }, [internalProgress, selectedIndex]);
  const source = progress ?? internalProgress;
  const segmentWidth = width > 0 ? width / options.length : 0;
  const thumbStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: source.value * segmentWidth }] }),
    [segmentWidth],
  );
  return (
    <GlassSurface
      interactive
      style={[styles.glassSegmented, style]}>
      <View
        accessibilityRole="tablist"
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.glassSegmentedRow}>
        {segmentWidth > 0 ? (
          <Reanimated.View
            pointerEvents="none"
            style={[
              styles.glassSegmentedThumb,
              {
                width: segmentWidth,
                backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : '#FFFFFF',
              },
              thumbStyle,
            ]}
          />
        ) : null}
        {options.map((option, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="tab"
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(index)}
              style={styles.glassSegmentedButton}>
              <Text
                numberOfLines={1}
                style={[
                  styles.glassSegmentedLabel,
                  {
                    fontSize,
                    color: selected ? colors.text : colors.textSecondary,
                    fontFamily: selected ? font.bodySemiBold : font.bodyMedium,
                  },
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

// Tasto circolare in vetro per la GlassNavBar (44pt, icona Material Symbols).
export function GlassIconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  tinted = false,
  iconStyle,
  children,
}: {
  icon?: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  tinted?: boolean;
  iconStyle?: StyleProp<TextStyle>;
  children?: ReactNode;
}) {
  const { colors } = useFlowndTheme();
  return (
    <GlassSurface
      interactive
      tintColor={tinted ? colors.accent : undefined}
      style={styles.glassIconButton}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        hitSlop={4}
        onPress={onPress}
        style={({ pressed }) => [styles.glassIconButtonPressable, pressed && styles.glassIconPressed]}>
        {children ?? (
          <Text
            style={[
              styles.glassIconGlyph,
              { color: tinted ? colors.onAccent : colors.text },
              iconStyle,
            ]}>
            {icon}
          </Text>
        )}
      </Pressable>
    </GlassSurface>
  );
}

// Barra di navigazione fissa (da passare a `Screen fixedHeader` insieme a
// `transparentHeaderOnScroll`): il titolo compatto compare scorrendo, accanto
// alle azioni in vetro.
export function GlassNavBar({
  title,
  titleVisible,
  centered = false,
  leading,
  actions,
}: {
  title: string;
  // Titolo compatto centrato nella barra invece che allineato a sinistra.
  centered?: boolean;
  // Se definito, comanda lui la comparsa del titolo (es. quando un elemento
  // della pagina raggiunge la barra) al posto della soglia di scroll standard.
  titleVisible?: boolean;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  const { colors } = useFlowndTheme();
  const scrollContext = useContext(ScrollHeaderContext);
  const [ownProgress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (titleVisible === undefined) return;
    const animation = Animated.timing(ownProgress, {
      toValue: titleVisible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [titleVisible, ownProgress]);
  const progress =
    titleVisible !== undefined ? ownProgress : (scrollContext?.headerProgress ?? null);
  const opacity = progress ?? 0;
  const translateY = progress
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })
    : 12;
  return (
    <View pointerEvents="box-none" style={styles.glassNavBar}>
      {leading ? <View style={styles.glassNavLeading}>{leading}</View> : null}
      <Animated.Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        numberOfLines={1}
        pointerEvents="none"
        style={[
          styles.glassNavTitle,
          centered && styles.glassNavTitleCentered,
          { color: colors.text, opacity, transform: [{ translateY }] },
        ]}>
        {title}
      </Animated.Text>
      {actions ? <View style={styles.glassNavActions}>{actions}</View> : null}
    </View>
  );
}

// Titolo grande in stile iOS: sfuma scorrendo mentre quello compatto sale
// nella GlassNavBar.
export function LargeTitle({ title }: { title: string }) {
  const { colors } = useFlowndTheme();
  const scrollContext = useContext(ScrollHeaderContext);
  const opacity = scrollContext
    ? scrollContext.headerProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
    : 1;
  return (
    <Animated.Text
      accessibilityRole="header"
      numberOfLines={1}
      style={[styles.largeTitle, { color: colors.text, opacity }]}>
      {title}
    </Animated.Text>
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
  compactHeaderBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
  },
  fixedScreenHeader: {
    position: 'absolute',
    right: 20,
    left: 20,
    height: 44,
    zIndex: 40,
    elevation: 9,
  },
  maskSolid: { backgroundColor: '#000000' },
  firstFocusCover: { zIndex: 100, elevation: 20 },
  scroll: { flexGrow: 1 },
  screenContent: { flex: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 110 },
  floatingAction: {
    position: 'absolute',
    right: 20,
    bottom: 112,
  },
  floatingActionCenter: { left: 20, alignItems: 'center' },
  floatingActionFree: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
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
  compactButton: { minHeight: 44, marginTop: 0 },
  gradientPressable: { minHeight: 52, marginTop: 18, borderRadius: radius.control, overflow: 'hidden' },
  compactGradientPressable: { minHeight: 72, marginTop: 0 },
  gradient: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  compactGradient: { minHeight: 72, paddingHorizontal: 10 },
  gradientContent: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  gradientIcon: { color: '#FFFFFF', fontFamily: 'MaterialSymbols_400Regular', fontSize: 24, lineHeight: 27 },
  compactGradientText: { fontSize: 12, textAlign: 'center' },
  primaryText: { color: '#FFFFFF', fontFamily: font.bodySemiBold, fontSize: 16 },
  secondaryText: { fontFamily: font.bodySemiBold, fontSize: 15 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIconGlyph: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
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
  glassFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#0B241B',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
    elevation: 3,
  },
  glassSegmented: { height: 44, borderRadius: 22, padding: 4 },
  glassSegmentedRow: { flex: 1, flexDirection: 'row' },
  glassSegmentedThumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  glassSegmentedButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glassSegmentedLabel: { textAlign: 'center' },
  glassNavBar: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  glassNavTitle: {
    flex: 1,
    fontFamily: font.displayBold,
    fontSize: 19,
    letterSpacing: -0.2,
    marginRight: 10,
  },
  glassNavTitleCentered: {
    position: 'absolute',
    left: 64,
    right: 64,
    marginRight: 0,
    textAlign: 'center',
  },
  glassNavActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glassNavLeading: { marginRight: 10 },
  glassIconButton: { width: 44, height: 44, borderRadius: 22 },
  glassIconButtonPressable: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glassIconPressed: { opacity: 0.65 },
  glassIconGlyph: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 24 },
  largeTitle: {
    fontFamily: font.displayBold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.4,
    marginTop: 40,
  },
  barFill: { height: '100%', borderRadius: 7 },
});
