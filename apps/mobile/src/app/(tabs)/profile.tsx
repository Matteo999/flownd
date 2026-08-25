import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Card,
  PageHeader,
  Screen,
  font,
  useFlowndTheme,
} from '@/components/flownd-ui';
import { UserAvatar } from '@/components/app-header-actions';
import type { ThemePreference } from '@/constants/flownd-theme';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/providers/app-provider';

const themeOptions: {
  id: ThemePreference;
  label: string;
  icon: string;
}[] = [
  { id: 'light', label: 'Chiaro', icon: 'light_mode' },
  { id: 'dark', label: 'Scuro', icon: 'dark_mode' },
  { id: 'system', label: 'Sistema', icon: 'settings_suggest' },
];

export default function ProfileScreen() {
  const {
    colors,
    themePreference,
    setThemePreference,
  } = useFlowndTheme();
  const {
    session,
    planTier,
    amountsVisible,
    toggleAmountsVisible,
  } = useApp();

  return (
    <Screen>
      <PageHeader
        title="Profilo"
        leading={
          <Pressable
            accessibilityLabel="Indietro"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
          </Pressable>
        }
      />

      <Card style={styles.identity}>
        <UserAvatar size={48} />
        <View style={styles.flex}>
          <Text style={[styles.email, { color: colors.text }]}>
            {session?.user.email ?? 'Account Flownd'}
          </Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            Piano {planTier === 'free' ? 'Free' : planTier === 'pro' ? 'Pro' : 'Max'}
          </Text>
        </View>
        <View style={[styles.verified, { backgroundColor: colors.positiveSoft }]}>
          <Text style={[styles.materialIcon, { color: colors.positive }]}>verified</Text>
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ASPETTO</Text>
      <Card>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Tema dell’app</Text>
        <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>
          Scegli un aspetto fisso oppure segui automaticamente il dispositivo.
        </Text>
        <View
          accessibilityRole="radiogroup"
          style={[styles.themeControl, { backgroundColor: colors.sunken }]}>
          {themeOptions.map((option) => {
            const selected = themePreference === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Tema ${option.label}`}
                onPress={() => void setThemePreference(option.id)}
                style={[
                  styles.themeOption,
                  selected && {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.themeIcon,
                    { color: selected ? colors.accent : colors.textSecondary },
                  ]}>
                  {option.icon}
                </Text>
                <Text
                  style={[
                    styles.themeLabel,
                    { color: selected ? colors.text : colors.textSecondary },
                  ]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.currentTheme, { color: colors.textSecondary }]}>
          {themePreference === 'system'
            ? 'Il tema cambierà insieme alle impostazioni di sistema.'
            : `Flownd resterà in modalità ${themePreference === 'dark' ? 'scura' : 'chiara'}.`}
        </Text>
      </Card>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PREFERENZE</Text>
      <View style={styles.list}>
        <ProfileRow
          icon="account_balance_wallet"
          label="Budget"
          caption="Allocazione, categorie e mese finanziario"
          onPress={() => router.push('/budget' as Href)}
        />
        <ProfileRow
          icon="group"
          label="Gruppi e condivisione"
          caption="Famiglia, permessi, split e budget condivisi"
          onPress={() => router.push('/family' as Href)}
        />
        <ProfileRow
          icon={amountsVisible ? 'visibility' : 'visibility_off'}
          label="Importi visibili"
          caption={
            amountsVisible
              ? 'Gli importi sono mostrati nelle schermate principali'
              : 'Gli importi sensibili sono nascosti'
          }
          trailing={
            <View
              style={[
                styles.switchTrack,
                {
                  backgroundColor: amountsVisible
                    ? colors.accent
                    : colors.sunken,
                },
              ]}>
              <View
                style={[
                  styles.switchThumb,
                  {
                    backgroundColor: colors.surface,
                    transform: [{ translateX: amountsVisible ? 18 : 0 }],
                  },
                ]}
              />
            </View>
          }
          accessibilityRole="switch"
          accessibilityState={{ checked: amountsVisible }}
          onPress={() => void toggleAmountsVisible()}
        />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ACCOUNT</Text>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          const { error } = await supabase.auth.signOut();
          if (!error) {
            router.replace('/onboarding?transition=back' as Href);
          }
        }}
        style={({ pressed }) => [
          styles.signOut,
          { backgroundColor: colors.negativeSoft },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.signOutIcon, { color: colors.negative }]}>logout</Text>
        <Text style={[styles.signOutText, { color: colors.negative }]}>Esci da Flownd</Text>
      </Pressable>
    </Screen>
  );
}

function ProfileRow({
  icon,
  label,
  caption,
  trailing,
  onPress,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  icon: string;
  label: string;
  caption: string;
  trailing?: ReactNode;
  onPress: () => void;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: { checked: boolean };
}) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={styles.row}>
        <View style={[styles.rowIcon, { backgroundColor: colors.sunken }]}>
          <Text style={[styles.materialIcon, { color: colors.textSecondary }]}>
            {icon}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>
            {caption}
          </Text>
        </View>
        {trailing ?? (
          <Text style={[styles.chevron, { color: colors.textSecondary }]}>›</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  email: { fontFamily: font.bodySemiBold, fontSize: 14 },
  caption: { fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 2 },
  verified: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  sectionLabel: { fontFamily: font.bodySemiBold, fontSize: 10, letterSpacing: 1.1, marginTop: 24, marginBottom: 8 },
  cardTitle: { fontFamily: font.bodySemiBold, fontSize: 15 },
  cardCopy: { fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 3 },
  themeControl: { flexDirection: 'row', borderRadius: 12, padding: 3, marginTop: 15 },
  themeOption: { flex: 1, minHeight: 68, borderRadius: 9, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4 },
  themeIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22 },
  themeLabel: { fontFamily: font.bodySemiBold, fontSize: 11 },
  currentTheme: { fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 10 },
  list: { gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 70, gap: 11 },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: font.bodyMedium, fontSize: 14 },
  chevron: { fontFamily: font.body, fontSize: 24 },
  switchTrack: { width: 42, height: 24, borderRadius: 12, padding: 3 },
  switchThumb: { width: 18, height: 18, borderRadius: 9 },
  signOut: { minHeight: 54, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  signOutIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 19 },
  signOutText: { fontFamily: font.bodySemiBold, fontSize: 13 },
  pressed: { opacity: 0.7 },
});
