set -u
PU=$(docker exec hbx-postgres printenv POSTGRES_USER 2>/dev/null)
PD=$(docker exec hbx-postgres printenv POSTGRES_DB 2>/dev/null)
echo "postgres user=$PU db=$PD"
echo
echo '== totais atuais =='
docker exec hbx-postgres psql -U "$PU" -d "$PD" -t -A -c 'select count(*) as users from "User";'
docker exec hbx-postgres psql -U "$PU" -d "$PD" -t -A -c 'select count(*) as companies from "Company";'
echo
echo '== contas Google ja existentes (googleId nao nulo) =='
docker exec hbx-postgres psql -U "$PU" -d "$PD" -t -A -c 'select count(*) from "User" where "googleId" is not null;'
echo
echo '== o email da tela ja existe? =='
docker exec hbx-postgres psql -U "$PU" -d "$PD" -t -A -F '|' -c $'select id, email, role, "googleId" is not null as has_google, "companyId" from "User" where lower(email) in (\'baratimports@gmail.com\',\'barataimports@gmail.com\',\'jbinformatica1100@gmail.com\');'
