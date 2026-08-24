import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Card,
  Field,
  PageHeader,
  PrimaryButton,
  Screen,
  font,
  uiStyles,
  useFlowndTheme,
} from '@/components/flownd-ui';
import {
  type BudgetCategory,
  type BudgetGroupKey,
  budgetCategoryIcon,
  budgetGroups,
} from '@/lib/onboarding';
import { useApp } from '@/providers/app-provider';

function isBudgetGroup(value: string | undefined): value is BudgetGroupKey {
  return value === 'needs' || value === 'wants' || value === 'savings';
}

export default function BudgetSubcategoryScreen() {
  const { colors } = useFlowndTheme();
  const params = useLocalSearchParams<{ parent?: string }>();
  const parent = isBudgetGroup(params.parent) ? params.parent : null;
  const {
    draft,
    saving,
    error,
    clearError,
    createBudgetSubcategory,
    deleteBudgetSubcategory,
  } = useApp();
  const sourceChildren = useMemo(
    () => draft.budgets.filter(
      (item) => item.selected && !item.isMacro && item.parentId === parent,
    ),
    [draft.budgets, parent],
  );
  const [children, setChildren] = useState(sourceChildren);
  const childrenRef = useRef(children);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [name, setName] = useState('');
  const [newParentCategoryId, setNewParentCategoryId] = useState<string | null>(null);
  const group = budgetGroups.find((item) => item.id === parent);
  const topLevel = children.filter((item) => !item.parentCategoryId);

  function updateChildren(next: BudgetCategory[]) {
    childrenRef.current = next;
    setChildren(next);
  }

  function openCreator(parentCategoryId: string | null = null) {
    clearError();
    setName('');
    setNewParentCategoryId(parentCategoryId);
    setCreatorOpen(true);
  }

  function closeCreator() {
    if (saving) return;
    clearError();
    setCreatorOpen(false);
    setName('');
    setNewParentCategoryId(null);
  }

  function confirmDelete(child: BudgetCategory) {
    const nestedCount = childrenRef.current.filter(
      (item) => item.parentCategoryId === child.id,
    ).length;
    Alert.alert(
      `Eliminare ${child.name}?`,
      nestedCount
        ? `Verranno eliminate anche ${nestedCount} sottocategorie collegate.`
        : 'La categoria delle transazioni esistenti non verrà modificata.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => void (async () => {
            if (await deleteBudgetSubcategory(child.id)) {
              updateChildren(childrenRef.current.filter(
                (item) => item.id !== child.id && item.parentCategoryId !== child.id,
              ));
            }
          })(),
        },
      ],
    );
  }

  if (!parent || !group) {
    return (
      <Screen>
        <PageHeader title="Categorie" leading={<BackButton />} />
        <Text style={[uiStyles.error, { color: colors.negative }]}>Macro-categoria non valida.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader
        title={`Categorie ${group.name}`}
        leading={<BackButton />}
        action={<AddButton onPress={() => openCreator()} />}
      />
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Organizza le transazioni con categorie personalizzate e un solo livello di sottocategorie.
      </Text>

      {topLevel.length ? (
        <View style={styles.list}>
          {topLevel.map((child) => (
            <CategoryCard
              key={child.id}
              child={child}
              nested={children.filter((item) => item.parentCategoryId === child.id)}
              onAddNested={() => openCreator(child.id)}
              onDelete={confirmDelete}
            />
          ))}
        </View>
      ) : (
        <Card style={styles.empty}>
          <Text style={[styles.emptyIcon, { color: colors.textSecondary }]}>category</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Nessuna categoria</Text>
          <Text style={[styles.emptyCopy, { color: colors.textSecondary }]}>
            Usa il tasto + per aggiungere la prima categoria.
          </Text>
        </Card>
      )}

      {!creatorOpen && error ? (
        <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={creatorOpen}
        onRequestClose={closeCreator}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Chiudi aggiunta categoria"
            onPress={closeCreator}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
          />
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Nuova categoria</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
                  {newParentCategoryId
                    ? `Dentro ${topLevel.find((item) => item.id === newParentCategoryId)?.name ?? group.name}`
                    : `Dentro ${group.name}`}
                </Text>
              </View>
              <Pressable accessibilityLabel="Chiudi" hitSlop={8} onPress={closeCreator}>
                <Text style={[styles.closeIcon, { color: colors.textSecondary }]}>close</Text>
              </Pressable>
            </View>

            <Field
              autoFocus
              label="Nome"
              placeholder="es. Affitto"
              value={name}
              onChangeText={setName}
            />

            {error ? <Text style={[uiStyles.error, { color: colors.negative }]}>{error}</Text> : null}
            <PrimaryButton
              disabled={!name.trim()}
              loading={saving}
              onPress={async () => {
                const created = await createBudgetSubcategory(
                  parent,
                  name.trim(),
                  newParentCategoryId,
                );
                if (created) {
                  updateChildren([...childrenRef.current, created]);
                  setCreatorOpen(false);
                  setName('');
                  setNewParentCategoryId(null);
                }
              }}>
              Aggiungi categoria
            </PrimaryButton>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function CategoryCard({
  child,
  nested,
  onAddNested,
  onDelete,
}: {
  child: BudgetCategory;
  nested: BudgetCategory[];
  onAddNested: () => void;
  onDelete: (child: BudgetCategory) => void;
}) {
  const { colors } = useFlowndTheme();
  return (
    <Card style={styles.categoryCard}>
      <View style={styles.categoryRow}>
        <View style={[styles.categoryIconBox, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.categoryIcon, { color: colors.accent }]}>
            {budgetCategoryIcon(child)}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.categoryName, { color: colors.text }]}>{child.name}</Text>
          <Text style={[styles.categoryCaption, { color: colors.textSecondary }]}>
            {nested.length ? `${nested.length} sottocategorie` : 'Nessuna sottocategoria'}
          </Text>
        </View>
        <Pressable accessibilityLabel={`Aggiungi dentro ${child.name}`} hitSlop={8} onPress={onAddNested}>
          <Text style={[styles.rowActionIcon, { color: colors.accent }]}>add</Text>
        </Pressable>
        <Pressable accessibilityLabel={`Elimina ${child.name}`} hitSlop={8} onPress={() => onDelete(child)}>
          <Text style={[styles.rowActionIcon, { color: colors.negative }]}>delete</Text>
        </Pressable>
      </View>

      {nested.length ? (
        <View style={[styles.nestedList, { borderTopColor: colors.border }]}>
          {nested.map((item) => (
            <View key={item.id} style={styles.nestedRow}>
              <Text style={[styles.branchIcon, { color: colors.textSecondary }]}>subdirectory_arrow_right</Text>
              <Text style={[styles.nestedCategoryIcon, { color: colors.textSecondary }]}>
                {budgetCategoryIcon(item)}
              </Text>
              <Text style={[styles.nestedName, { color: colors.text }]}>{item.name}</Text>
              <Pressable accessibilityLabel={`Elimina ${item.name}`} hitSlop={8} onPress={() => onDelete(item)}>
                <Text style={[styles.rowActionIcon, { color: colors.negative }]}>delete</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function AddButton({ onPress }: { onPress: () => void }) {
  const { colors } = useFlowndTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Aggiungi categoria" hitSlop={8} onPress={onPress}>
      <View style={[styles.addButton, { backgroundColor: colors.accent }]}>
        <Text style={styles.addIcon}>add</Text>
      </View>
    </Pressable>
  );
}

function BackButton() {
  const { colors } = useFlowndTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Indietro"
      hitSlop={8}
      onPress={() => router.back()}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
      <Text style={[styles.materialIcon, { color: colors.text }]}>arrow_back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  materialIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 22, lineHeight: 25 },
  addButton: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  addIcon: { color: '#FFFFFF', fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  intro: { fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  list: { gap: 9 },
  categoryCard: { paddingVertical: 13 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  categoryIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 20 },
  categoryName: { fontFamily: font.bodySemiBold, fontSize: 12 },
  categoryCaption: { fontFamily: font.body, fontSize: 9, marginTop: 2 },
  rowActionIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 19 },
  nestedList: { marginTop: 11, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 5 },
  nestedRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 },
  branchIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 17 },
  nestedCategoryIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 17 },
  nestedName: { flex: 1, fontFamily: font.bodyMedium, fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 28 },
  emptyIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 29 },
  emptyTitle: { fontFamily: font.bodySemiBold, fontSize: 13, marginTop: 7 },
  emptyCopy: { fontFamily: font.body, fontSize: 10, marginTop: 3 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(4, 16, 24, 0.48)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, gap: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: font.bodySemiBold, fontSize: 17 },
  sheetSubtitle: { fontFamily: font.body, fontSize: 10, marginTop: 3 },
  closeIcon: { fontFamily: 'MaterialSymbols_400Regular', fontSize: 21 },
  pressed: { opacity: 0.68 },
});
