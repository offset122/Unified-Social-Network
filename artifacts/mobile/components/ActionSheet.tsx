import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { RADIUS } from "@/constants/colors";
import { haptics } from "@/lib/motion";

export interface ActionSheetItem {
  id: string;
  label: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  message?: string;
  items: ActionSheetItem[];
  onClose: () => void;
  cancelLabel?: string;
}

export function ActionSheet({
  visible,
  title,
  message,
  items,
  onClose,
  cancelLabel = "Cancel",
}: ActionSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgOverlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.muted }]} />
          {(title || message) && (
            <View style={[styles.header, { borderBottomColor: colors.separator }]}>
              {title && (
                <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.35}>
                  {title}
                </Text>
              )}
              {message && (
                <Text style={[styles.message, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
                  {message}
                </Text>
              )}
            </View>
          )}

          <ScrollView style={styles.list} bounces={false}>
            {items.map((item, idx) => {
              const fg = item.destructive
                ? colors.semanticDanger
                : item.selected
                ? colors.accentPrimary
                : colors.textPrimary;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    haptics.selection();
                    onClose();
                    item.onPress();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    idx < items.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.separator,
                    },
                    pressed && { backgroundColor: colors.accentTint },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: !!item.selected }}
                >
                  {item.icon && (
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: item.destructive
                            ? "rgba(225,29,72,0.10)"
                            : colors.accentTint,
                        },
                      ]}
                    >
                      <Feather name={item.icon} size={18} color={fg} />
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: fg }]} maxFontSizeMultiplier={1.35}>
                      {item.label}
                    </Text>
                    {item.subtitle && (
                      <Text
                        style={[styles.rowSubtitle, { color: colors.textSecondary }]}
                        maxFontSizeMultiplier={1.35}
                      >
                        {item.subtitle}
                      </Text>
                    )}
                  </View>
                  {item.selected && (
                    <Feather name="check" size={18} color={colors.accentPrimary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancelBtn,
              {
                backgroundColor: colors.secondary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>
              {cancelLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface PromptSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  multiline?: boolean;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}

export function PromptSheet({
  visible,
  title,
  message,
  placeholder = "Type here...",
  initialValue = "",
  submitLabel = "Save",
  multiline = false,
  onSubmit,
  onClose,
}: PromptSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  if (!visible) return null;

  const trimmed = value.trim();

  const handleConfirm = () => {
    if (!trimmed) return;
    haptics.success();
    onClose();
    onSubmit(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.root}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgOverlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bgElevated,
              borderColor: colors.separator,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.muted }]} />
          <View style={styles.promptBody}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            {message && (
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                {message}
              </Text>
            )}
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={colors.textTertiary}
              autoFocus
              multiline={multiline}
              onSubmitEditing={multiline ? undefined : handleConfirm}
              style={[
                styles.promptInput,
                multiline && { minHeight: 88, textAlignVertical: "top" },
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.input,
                  borderColor: colors.separator,
                },
              ]}
              accessibilityLabel={title}
            />
            <View style={styles.promptActions}>
              <Pressable
                onPress={onClose}
                style={[styles.promptBtn, { backgroundColor: colors.secondary }]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.promptBtnText, { color: colors.textPrimary }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={!trimmed}
                style={[
                  styles.promptBtn,
                  {
                    backgroundColor: colors.accentPrimary,
                    opacity: trimmed ? 1 : 0.45,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={submitLabel}
              >
                <Text style={[styles.promptBtnText, { color: "#FFFFFF" }]}>
                  {submitLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 540,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" as const } : {}),
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  list: {
    maxHeight: 380,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15.5,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: 12.5,
  },
  cancelBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios" ? { borderCurve: "continuous" as const } : {}),
  },
  cancelText: {
    fontSize: 15.5,
    fontWeight: "600",
  },
  promptBody: {
    gap: 12,
    paddingBottom: 6,
  },
  promptInput: {
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15.5,
    minHeight: 46,
  },
  promptActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  promptBtn: {
    flex: 1,
    height: 46,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  promptBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
