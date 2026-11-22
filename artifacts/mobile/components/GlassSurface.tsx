import React from "react";
import { Platform, View, type ViewProps, type ViewStyle, type StyleProp } from "react-native";
import { useColors } from "@/hooks/useColors";

interface GlassSurfaceProps extends ViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: "material" | "dark";
}

export function GlassSurface({
  children,
  style,
  tint = "material",
  ...rest
}: GlassSurfaceProps) {
  const colors = useColors();
  const backgroundColor =
    tint === "dark" ? "rgba(18,18,22,0.82)" : colors.bgMaterial;

  const webBlur =
    Platform.OS === "web"
      ? ({
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
        } as unknown as ViewStyle)
      : undefined;

  return (
    <View
      style={[{ backgroundColor }, webBlur, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
