import React, { useState } from "react";
import { Image, View, Text, type StyleProp, type ViewStyle, type ImageStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { resolveMediaUrl } from "@/lib/db";

interface AvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  size: number;
  style?: StyleProp<ViewStyle>;
  ringColors?: [string, string, ...string[]];
  ringViewed?: boolean;
  ringWidth?: number;
  showOnline?: boolean;
  canvasColor?: string;
}

export function Avatar({
  name = "User",
  avatarUrl,
  size,
  style,
  ringColors,
  ringViewed = false,
  ringWidth = 2.5,
  showOnline = false,
  canvasColor = "#FFFFFF",
}: AvatarProps) {
  const [err, setErr] = useState(false);
  const safeName = (name ?? "User").trim() || "User";
  const initials = safeName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = safeName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  const hasRing = !!ringColors || ringViewed;
  const innerSize = hasRing ? size - ringWidth * 2 - 4 : size;

  const core =
    avatarUrl && !err ? (
      <Image
        source={{ uri: resolveMediaUrl(avatarUrl) }}
        style={[
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
          } as ImageStyle,
          !hasRing ? (style as ImageStyle) : undefined,
        ]}
        onError={() => setErr(true)}
        accessibilityRole="image"
        accessibilityLabel={`${safeName} avatar`}
      />
    ) : (
      <View
        accessibilityRole="image"
        accessibilityLabel={`${safeName} avatar`}
        style={[
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            backgroundColor: `hsl(${hue}, 52%, 44%)`,
            alignItems: "center",
            justifyContent: "center",
          },
          !hasRing ? style : undefined,
        ]}
      >
        <Text style={{ color: "#FFFFFF", fontSize: innerSize * 0.37, fontWeight: "700" }}>
          {initials}
        </Text>
      </View>
    );

  const onlineDot = showOnline ? (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        width: Math.max(10, Math.round(size * 0.26)),
        height: Math.max(10, Math.round(size * 0.26)),
        borderRadius: 999,
        backgroundColor: "#059669",
        borderWidth: 2,
        borderColor: canvasColor,
      }}
    />
  ) : null;

  if (!hasRing) {
    return showOnline ? (
      <View style={[{ width: size, height: size }, style]}>
        {core}
        {onlineDot}
      </View>
    ) : (
      core
    );
  }

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      {ringViewed ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: "rgba(142,142,147,0.45)",
            alignItems: "center",
            justifyContent: "center",
            padding: 2,
          }}
        >
          {core}
        </View>
      ) : (
        <LinearGradient
          colors={ringColors ?? ["#8B5CF6", "#EC4899", "#F59E0B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            padding: ringWidth,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: innerSize + 4,
              height: innerSize + 4,
              borderRadius: (innerSize + 4) / 2,
              backgroundColor: canvasColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {core}
          </View>
        </LinearGradient>
      )}
      {onlineDot}
    </View>
  );
}
