import React, { useState } from "react";
import { Image, View, Text } from "react-native";
import { resolveMediaUrl } from "@/lib/db";

export function Avatar({
  name,
  avatarUrl,
  size,
  style,
}: {
  name: string;
  avatarUrl?: string | null;
  size: number;
  style?: object;
}) {
  const [err, setErr] = useState(false);
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  if (avatarUrl && !err) {
    return (
      <Image
        source={{ uri: resolveMediaUrl(avatarUrl) }}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
        onError={() => setErr(true)}
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `hsl(${hue},55%,45%)`,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.38, fontWeight: "700" }}>
        {initials}
      </Text>
    </View>
  );
}
