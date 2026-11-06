from getpass import getpass
from supabase import create_client
from app.core.config import settings

client = create_client(settings.supabase_url, settings.supabase_anon_key)

email = input("Estimator email: ")
password = getpass("Estimator password: ")

response = client.auth.sign_in_with_password({"email": email, "password": password})

print("\nLogin successful!")
print("\nYour access token:\n")
print(response.session.access_token)
