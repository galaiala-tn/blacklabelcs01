export enum AppRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
  CHAUFFEUR = 'chauffeur',
}

export enum ReservationType {
  ONE_WAY_TRANSFER = 'one_way_transfer',
  HOURLY_CHAUFFEUR = 'hourly_chauffeur',
}

export enum ReservationStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CHAUFFEUR_ASSIGNED = 'chauffeur_assigned',
  ON_THE_WAY = 'on_the_way',
  ARRIVED = 'arrived',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ChauffeurTripStatus {
  ACCEPTED = 'accepted',
  ON_THE_WAY = 'on_the_way',
  ARRIVED = 'arrived',
  STARTED = 'started',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CARD = 'card',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  CASH = 'cash',
  OTHER = 'other',
}

export enum InvoiceStatus {
  ISSUED = 'issued',
  PAID = 'paid',
  VOID = 'void',
}

export enum NotificationType {
  RESERVATION_CONFIRMED = 'reservation_confirmed',
  CHAUFFEUR_ASSIGNED = 'chauffeur_assigned',
  CHAUFFEUR_ON_THE_WAY = 'chauffeur_on_the_way',
  CHAUFFEUR_ARRIVED = 'chauffeur_arrived',
  TRIP_COMPLETED = 'trip_completed',
  PAYMENT_RECEIVED = 'payment_received',
  GENERAL = 'general',
}

export enum ChauffeurStatus {
  OFFLINE = 'offline',
  AVAILABLE = 'available',
  BUSY = 'busy',
}

/** Maps a reservation status change to the notification it should trigger. */
export const STATUS_TO_NOTIFICATION: Partial<Record<ReservationStatus, NotificationType>> = {
  [ReservationStatus.CONFIRMED]: NotificationType.RESERVATION_CONFIRMED,
  [ReservationStatus.CHAUFFEUR_ASSIGNED]: NotificationType.CHAUFFEUR_ASSIGNED,
  [ReservationStatus.ON_THE_WAY]: NotificationType.CHAUFFEUR_ON_THE_WAY,
  [ReservationStatus.ARRIVED]: NotificationType.CHAUFFEUR_ARRIVED,
  [ReservationStatus.COMPLETED]: NotificationType.TRIP_COMPLETED,
};
