#!/bin/bash
# 1. Install prerequisites for adding repositories
apt-get update && apt-get install -y wget gnupg2

# 2. Add the official PostgreSQL repository key and list
wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(awk -F= '/^VERSION_CODENAME/{print $2}' /etc/os-release)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

# 3. Update apt and install the v17 client
apt-get update
apt-get install -y postgresql-client-17