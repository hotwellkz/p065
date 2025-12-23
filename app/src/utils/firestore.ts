import { Timestamp } from "firebase/firestore";

export const toTimestamp = (value?: Timestamp | Date | string): Timestamp => {
  if (!value) {
    return Timestamp.now();
  }
  if (value instanceof Timestamp) {
    return value;
  }
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  return Timestamp.fromDate(new Date(value));
};

export const timestampToDate = (timestamp?: Timestamp): Date =>
  timestamp ? timestamp.toDate() : new Date();

export const timestampToIso = (timestamp?: Timestamp): string =>
  timestampToDate(timestamp).toISOString();

