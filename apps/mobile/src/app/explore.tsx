import { StatusBar } from 'expo-status-bar';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TransactionGroup = {
  day: string;
  total: string;
  items: {
    icon: SymbolViewProps['name'];
    title: string;
    category: string;
    amount: string;
    color: string;
    iconColor: string;
    positive?: boolean;
  }[];
};

const groups: TransactionGroup[] = [
  {
    day: 'OGGI',
    total: '− 110,20 €',
    items: [
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
    ],
  },
  {
    day: 'IERI',
    total: '+ 2.412,10 €',
    items: [
      {
        icon: { ios: 'arrow.down.left', android: 'south_west', web: 'south_west' },
        title: 'Stipendio',
        category: 'Entrate',
        amount: '+ 2.450,00 €',
        color: '#E8F8F4',
        iconColor: '#119B7E',
        positive: true,
      },
      {
        icon: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
        title: 'Osteria del Borgo',
        category: 'Ristoranti',
        amount: '− 37,90 €',
        color: '#FFF3E8',
        iconColor: '#E58B3B',
      },
    ],
  },
];

export default function TransactionsScreen() {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>LUGLIO 2026</Text>
              <Text style={styles.title}>Movimenti</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
                size={19}
                tintColor="#17323A"
              />
            </Pressable>
          </View>

          <View style={styles.summary}>
            <View>
              <Text style={styles.summaryLabel}>Entrate</Text>
              <Text style={[styles.summaryValue, styles.income]}>+ 2.450 €</Text>
            </View>
            <View style={styles.divider} />
            <View>
              <Text style={styles.summaryLabel}>Uscite</Text>
              <Text style={styles.summaryValue}>− 1.246 €</Text>
            </View>
            <View style={styles.divider} />
            <View>
              <Text style={styles.summaryLabel}>Saldo</Text>
              <Text style={styles.summaryValue}>+ 1.204 €</Text>
            </View>
          </View>

          <View style={styles.search}>
            <SymbolView
              name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
              size={17}
              tintColor="#7A898F"
            />
            <Text style={styles.searchPlaceholder}>Cerca un movimento</Text>
          </View>

          {groups.map((group) => (
            <View key={group.day} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupDay}>{group.day}</Text>
                <Text style={styles.groupTotal}>{group.total}</Text>
              </View>
              <View style={styles.card}>
                {group.items.map((item, index) => (
                  <View
                    key={item.title}
                    style={[styles.row, index < group.items.length - 1 && styles.rowBorder]}>
                    <View style={[styles.icon, { backgroundColor: item.color }]}>
                      <SymbolView name={item.icon} size={20} tintColor={item.iconColor} />
                    </View>
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.category}>{item.category}</Text>
                    </View>
                    <Text style={[styles.amount, item.positive && styles.income]}>{item.amount}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <Pressable style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={25}
            tintColor="#FFFFFF"
          />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F8' },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 130 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  eyebrow: { color: '#708087', fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  title: { color: '#14232B', fontSize: 30, fontWeight: '700', letterSpacing: -1, marginTop: 4 },
  filterButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65, transform: [{ scale: 0.97 }] },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 17,
    borderRadius: 20,
    backgroundColor: '#17323A',
    marginBottom: 18,
  },
  summaryLabel: { color: '#A9BBC0', fontSize: 10, marginBottom: 5 },
  summaryValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  income: { color: '#21A98E' },
  divider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: '#496068' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 48,
    paddingHorizontal: 15,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAEC',
    marginBottom: 24,
  },
  searchPlaceholder: { color: '#7A898F', fontSize: 13 },
  group: { marginBottom: 22 },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
    paddingHorizontal: 2,
  },
  groupDay: { color: '#708087', fontSize: 10, fontWeight: '700', letterSpacing: 0.9 },
  groupTotal: { color: '#708087', fontSize: 11, fontWeight: '600' },
  card: {
    paddingHorizontal: 15,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAEC',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E3EAEC' },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, marginLeft: 12 },
  itemTitle: { color: '#14232B', fontSize: 14, fontWeight: '600' },
  category: { color: '#708087', fontSize: 11, marginTop: 3 },
  amount: { color: '#14232B', fontSize: 13, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#39C9B6',
    shadowColor: '#1E9F8D',
    shadowOpacity: 0.28,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 7 },
  },
});
