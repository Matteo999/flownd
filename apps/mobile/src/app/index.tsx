import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const colors = {
  background: '#F4F7F8',
  surface: '#FFFFFF',
  ink: '#14232B',
  muted: '#708087',
  teal: '#39C9B6',
  blue: '#3E84E8',
  navy: '#17323A',
  line: '#E6ECEE',
  positive: '#119B7E',
  warning: '#EF9E51',
};

type Transaction = {
  icon: SymbolViewProps['name'];
  title: string;
  category: string;
  amount: string;
  color: string;
  iconColor: string;
  positive?: boolean;
};

const transactions: Transaction[] = [
  {
    icon: { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' },
    title: 'Coop Supermercato',
    category: 'Cibo e spesa',
    amount: '− 48,20 €',
    color: '#E8F8F4',
    iconColor: '#1FA58B',
  },
  {
    icon: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
    title: 'Q8',
    category: 'Trasporti',
    amount: '− 62,00 €',
    color: '#EDF3FD',
    iconColor: '#3E84E8',
  },
  {
    icon: { ios: 'arrow.down.left', android: 'south_west', web: 'south_west' },
    title: 'Stipendio',
    category: 'Entrate',
    amount: '+ 2.450,00 €',
    color: '#E8F8F4',
    iconColor: '#119B7E',
    positive: true,
  },
];

function ActionButton({
  label,
  icon,
  emphasized = false,
}: {
  label: string;
  icon: SymbolViewProps['name'];
  emphasized?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={[styles.actionIcon, emphasized && styles.actionIconEmphasized]}>
        <SymbolView name={icon} size={20} tintColor={emphasized ? '#FFFFFF' : colors.navy} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <Image
                source={require('@/assets/images/flownd-logo.png')}
                style={styles.logo}
                contentFit="contain"
              />
              <Text style={styles.brandName}>Flownd</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
              <Text style={styles.avatarText}>M</Text>
              <View style={styles.onlineDot} />
            </Pressable>
          </View>

          <View style={styles.welcome}>
            <Text style={styles.eyebrow}>BUONGIORNO, MATTEO</Text>
            <Text style={styles.pageTitle}>Le tue finanze,{'\n'}in un colpo d’occhio.</Text>
          </View>

          <View style={styles.balanceCard}>
            <View style={styles.decorativeCircleLarge} />
            <View style={styles.decorativeCircleSmall} />
            <Text style={styles.balanceLabel}>Disponibilità totale</Text>
            <Text style={styles.balance}>3.284,60 €</Text>
            <View style={styles.balanceFooter}>
              <View style={styles.trendPill}>
                <SymbolView
                  name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }}
                  size={13}
                  tintColor="#C8FFF4"
                />
                <Text style={styles.trendText}>+8,4%</Text>
              </View>
              <Text style={styles.balanceNote}>rispetto al mese scorso</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <ActionButton
              label="Aggiungi"
              emphasized
              icon={{ ios: 'plus', android: 'add', web: 'add' }}
            />
            <ActionButton
              label="Entrata"
              icon={{ ios: 'arrow.down.left', android: 'south_west', web: 'south_west' }}
            />
            <ActionButton
              label="Analisi"
              icon={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }}
            />
            <ActionButton
              label="Budget"
              icon={{ ios: 'target', android: 'track_changes', web: 'track_changes' }}
            />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Budget di luglio</Text>
            <Pressable>
              <Text style={styles.sectionLink}>Vedi tutti</Text>
            </Pressable>
          </View>

          <View style={styles.budgetCard}>
            <View style={styles.budgetTopRow}>
              <View>
                <Text style={styles.budgetLabel}>Spese mensili</Text>
                <Text style={styles.budgetAmount}>
                  1.246 € <Text style={styles.budgetTotal}>di 2.000 €</Text>
                </Text>
              </View>
              <View style={styles.percentBadge}>
                <Text style={styles.percentText}>62%</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
            <View style={styles.budgetMeta}>
              <Text style={styles.budgetMetaText}>754 € disponibili</Text>
              <Text style={styles.budgetMetaText}>8 giorni rimasti</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Movimenti recenti</Text>
            <Pressable>
              <Text style={styles.sectionLink}>Vedi tutti</Text>
            </Pressable>
          </View>

          <View style={styles.transactionCard}>
            {transactions.map((transaction, index) => (
              <View
                key={transaction.title}
                style={[
                  styles.transaction,
                  index < transactions.length - 1 && styles.transactionBorder,
                ]}>
                <View style={[styles.transactionIcon, { backgroundColor: transaction.color }]}>
                  <SymbolView
                    name={transaction.icon}
                    size={20}
                    tintColor={transaction.iconColor}
                  />
                </View>
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionTitle}>{transaction.title}</Text>
                  <Text style={styles.transactionCategory}>{transaction.category} · Oggi</Text>
                </View>
                <Text
                  style={[
                    styles.transactionAmount,
                    transaction.positive && styles.positiveAmount,
                  ]}>
                  {transaction.amount}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.insightCard}>
            <View style={styles.insightIcon}>
              <SymbolView
                name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }}
                size={20}
                tintColor={colors.blue}
              />
            </View>
            <View style={styles.insightCopy}>
              <Text style={styles.insightTitle}>Insight della settimana</Text>
              <Text style={styles.insightText}>
                Hai speso il 12% in meno in ristoranti rispetto alla settimana scorsa.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: { width: 34, height: 34 },
  brandName: { color: colors.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  avatarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.teal,
    borderWidth: 2,
    borderColor: colors.background,
  },
  welcome: { marginBottom: 20 },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.25,
    marginBottom: 7,
  },
  pageTitle: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -1,
  },
  balanceCard: {
    minHeight: 184,
    borderRadius: 26,
    padding: 22,
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  decorativeCircleLarge: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    right: -65,
    top: -75,
    backgroundColor: 'rgba(57, 201, 182, 0.18)',
  },
  decorativeCircleSmall: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    right: 20,
    bottom: -48,
    backgroundColor: 'rgba(62, 132, 232, 0.22)',
  },
  balanceLabel: { color: '#B8C9CD', fontSize: 13, fontWeight: '600' },
  balance: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1.2,
    marginTop: 10,
  },
  balanceFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 8 },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(57, 201, 182, 0.22)',
  },
  trendText: { color: '#C8FFF4', fontSize: 12, fontWeight: '700' },
  balanceNote: { color: '#A8BAC0', fontSize: 12 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 24,
    paddingHorizontal: 2,
  },
  action: { width: 68, alignItems: 'center', gap: 8 },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionIconEmphasized: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
    shadowColor: colors.teal,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  actionLabel: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 12,
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
  sectionLink: { color: colors.blue, fontSize: 13, fontWeight: '600' },
  budgetCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 25,
  },
  budgetTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  budgetLabel: { color: colors.muted, fontSize: 12, marginBottom: 5 },
  budgetAmount: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  budgetTotal: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  percentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#E9F8F5',
  },
  percentText: { color: colors.positive, fontSize: 12, fontWeight: '800' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8EEEF',
    overflow: 'hidden',
    marginTop: 17,
  },
  progressFill: { width: '62%', height: '100%', borderRadius: 4, backgroundColor: colors.teal },
  budgetMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  budgetMetaText: { color: colors.muted, fontSize: 11 },
  transactionCard: {
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 18,
  },
  transaction: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  transactionBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  transactionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionCopy: { flex: 1, marginLeft: 12 },
  transactionTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  transactionCategory: { color: colors.muted, fontSize: 11, marginTop: 3 },
  transactionAmount: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  positiveAmount: { color: colors.positive },
  insightCard: {
    flexDirection: 'row',
    padding: 17,
    borderRadius: 20,
    backgroundColor: '#EEF4FD',
    borderWidth: 1,
    borderColor: '#DFEAFB',
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  insightCopy: { flex: 1, marginLeft: 12 },
  insightTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  insightText: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
