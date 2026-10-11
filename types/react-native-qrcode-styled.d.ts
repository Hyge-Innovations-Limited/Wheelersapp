// The package ships no type entry of its own. Only what the app uses is declared.
declare module "react-native-qrcode-styled" {
  import type { ComponentType } from "react";
  import type { ColorValue, StyleProp, ViewStyle } from "react-native";

  const QRCodeStyled: ComponentType<{
    data: string;
    /** Side of one square of the code, in points. */
    pieceSize?: number;
    padding?: number;
    color?: ColorValue;
    style?: StyleProp<ViewStyle>;
  }>;
  export default QRCodeStyled;
}
