export interface CarDiagnostics {
  driverCode: string;
  frontWingLeft: number;     // downforce %
  frontWingRight: number;
  rearWingLeft: number;
  rearWingRight: number;
  ersDeployment: number;     // 0–100 %
  mguKRecovery: number;      // 0–100 %
  frontBrakeTempLeft: number;   // °C
  frontBrakeTempRight: number;
  rearBrakeTempLeft: number;
  rearBrakeTempRight: number;
}
