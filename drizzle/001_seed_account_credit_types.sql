insert into account_types (code, label, description, default_status, allowed_currencies)
values ('S01','Compte Standard','Compte courant pour dépôts et retraits réguliers','ACTIVE', array['CDF','USD']::"Currency"[])
on conflict (code) do update set label=excluded.label, description=excluded.description, default_status=excluded.default_status, allowed_currencies=excluded.allowed_currencies, updated_at=now();

insert into account_types (code, label, description, default_status, allowed_currencies)
values ('S02','Épargne Obligatoire','Compte d’épargne conditionnant l’éligibilité aux crédits','INACTIVE', array['CDF','USD']::"Currency"[])
on conflict (code) do update set label=excluded.label, description=excluded.description, default_status=excluded.default_status, allowed_currencies=excluded.allowed_currencies, updated_at=now();

insert into account_types (code, label, description, default_status, allowed_currencies)
values ('S03','Caution','Garantie financière associée aux crédits','INACTIVE', array['CDF','USD']::"Currency"[])
on conflict (code) do update set label=excluded.label, description=excluded.description, default_status=excluded.default_status, allowed_currencies=excluded.allowed_currencies, updated_at=now();

insert into account_types (code, label, description, default_status, allowed_currencies)
values ('S04','Crédit','Compte crédité à l’octroi et débité aux remboursements','INACTIVE', array['CDF','USD']::"Currency"[])
on conflict (code) do update set label=excluded.label, description=excluded.description, default_status=excluded.default_status, allowed_currencies=excluded.allowed_currencies, updated_at=now();

insert into account_types (code, label, description, default_status, allowed_currencies)
values ('S05','Bwakisa Carte','Service d’assistance pour épargne régulière (objectif/maturité)','INACTIVE', array['CDF','USD']::"Currency"[])
on conflict (code) do update set label=excluded.label, description=excluded.description, default_status=excluded.default_status, allowed_currencies=excluded.allowed_currencies, updated_at=now();

insert into account_types (code, label, description, default_status, allowed_currencies)
values ('S06','Amendes','Paiement des amendes liées aux engagements de crédit','INACTIVE', array['CDF','USD']::"Currency"[])
on conflict (code) do update set label=excluded.label, description=excluded.description, default_status=excluded.default_status, allowed_currencies=excluded.allowed_currencies, updated_at=now();

insert into credit_types (code, label, description, status, allowed_currencies, repayment_frequency, config)
values ('BOMBE','Crédit Bombé','Micro-crédit quotidien','ACTIVE', array['USD']::"Currency"[], 'DAILY', '{"feeBrackets":[{"upTo":20,"fee":2},{"upTo":50,"fee":4},{"upTo":100,"fee":8}],"interestRates":[]}')
on conflict (code) do update set label=excluded.label, description=excluded.description, status=excluded.status, allowed_currencies=excluded.allowed_currencies, repayment_frequency=excluded.repayment_frequency, config=excluded.config, updated_at=now();

insert into credit_types (code, label, description, status, allowed_currencies, repayment_frequency, config)
values ('TELEMA','Crédit Telema','Crédit mensuel 6/9/12 mois','ACTIVE', array['USD']::"Currency"[], 'MONTHLY', '{"feeBrackets":[{"upTo":300,"fee":20},{"upTo":400,"fee":25},{"upTo":500,"fee":30},{"upTo":600,"fee":35},{"upTo":700,"fee":40},{"upTo":800,"fee":45},{"upTo":900,"fee":50},{"upTo":1000,"fee":55},{"upTo":1100,"fee":60},{"upTo":1200,"fee":65},{"upTo":1300,"fee":70},{"upTo":1400,"fee":75},{"upTo":9999999,"fee":80}],"interestRates":[{"duration":12,"threshold":500,"rate":0.055},{"duration":12,"rate":0.05},{"duration":9,"threshold":500,"rate":0.053},{"duration":9,"rate":0.048},{"duration":6,"threshold":500,"rate":0.05},{"duration":6,"rate":0.045}]}')
on conflict (code) do update set label=excluded.label, description=excluded.description, status=excluded.status, allowed_currencies=excluded.allowed_currencies, repayment_frequency=excluded.repayment_frequency, config=excluded.config, updated_at=now();

insert into credit_types (code, label, description, status, allowed_currencies, repayment_frequency, config)
values ('VIMBISA','Crédit Vimbisa','Crédit à frais fixes en CDF','ACTIVE', array['CDF']::"Currency"[], 'WEEKLY', '{"feeBrackets":[{"upTo":50000,"fee":14000},{"upTo":100000,"fee":28000},{"upTo":150000,"fee":42000},{"upTo":200000,"fee":56000},{"upTo":999999999,"fee":56000}],"interestRates":[]}')
on conflict (code) do update set label=excluded.label, description=excluded.description, status=excluded.status, allowed_currencies=excluded.allowed_currencies, repayment_frequency=excluded.repayment_frequency, config=excluded.config, updated_at=now();

insert into credit_types (code, label, description, status, allowed_currencies, repayment_frequency, config)
values ('MOPAO','Crédit Mopao','Crédit hebdomadaire','ACTIVE', array['USD']::"Currency"[], 'WEEKLY', '{"feeBrackets":[],"interestRates":[]}')
on conflict (code) do update set label=excluded.label, description=excluded.description, status=excluded.status, allowed_currencies=excluded.allowed_currencies, repayment_frequency=excluded.repayment_frequency, config=excluded.config, updated_at=now();
