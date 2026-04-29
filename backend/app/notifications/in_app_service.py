class InAppNotificationService:
    def send(self, worker_user_id: str, message: str) -> dict[str, str]:
        return {
            'channel': 'in_app',
            'delivery_status': 'queued',
            'worker_user_id': worker_user_id,
            'message': message,
        }
