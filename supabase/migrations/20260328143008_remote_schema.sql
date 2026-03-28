


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'member'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."file_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "original_filename" "text" NOT NULL,
    "version_filename" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "upload_timestamp" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT false,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."file_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funder_pivot_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "uuid" NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "funder_name" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "upload_type" "text" NOT NULL,
    "pivot_file_path" "text" NOT NULL,
    "total_gross" numeric(15,2) NOT NULL,
    "total_fee" numeric(15,2) NOT NULL,
    "total_net" numeric(15,2) NOT NULL,
    "row_count" integer NOT NULL,
    "created_timestamp" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."funder_pivot_tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funder_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "funder_name" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "upload_type" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "stored_filename" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "upload_timestamp" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    CONSTRAINT "funder_uploads_upload_type_check" CHECK (("upload_type" = ANY (ARRAY['weekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."funder_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "funder_name" "text" NOT NULL,
    "date_funded" "date",
    "merchant_name" "text" NOT NULL,
    "website" "text",
    "advance_id" "text",
    "funder_advance_id" "text",
    "industry_naics_or_sic" "text",
    "state" "text",
    "fico" "text",
    "buy_rate" numeric(8,4),
    "commission" numeric(15,2),
    "total_amount_funded" numeric(15,2),
    "created_timestamp" timestamp with time zone DEFAULT "now"(),
    "updated_timestamp" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."merchants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolio_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "portfolio_name" "text" NOT NULL,
    "access_level" "text" DEFAULT 'read'::"text",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "uuid",
    CONSTRAINT "portfolio_access_access_level_check" CHECK (("access_level" = ANY (ARRAY['read'::"text", 'write'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."portfolio_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."file_versions"
    ADD CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funder_pivot_tables"
    ADD CONSTRAINT "funder_pivot_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funder_uploads"
    ADD CONSTRAINT "funder_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funder_uploads"
    ADD CONSTRAINT "funder_uploads_portfolio_name_funder_name_report_date_uploa_key" UNIQUE ("portfolio_name", "funder_name", "report_date", "upload_type", "original_filename");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_portfolio_name_funder_name_merchant_name_advance__key" UNIQUE ("portfolio_name", "funder_name", "merchant_name", "advance_id");



ALTER TABLE ONLY "public"."portfolio_access"
    ADD CONSTRAINT "portfolio_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_file_versions_portfolio" ON "public"."file_versions" USING "btree" ("portfolio_name");



CREATE INDEX "idx_file_versions_user" ON "public"."file_versions" USING "btree" ("user_id");



CREATE INDEX "idx_funder_pivot_portfolio" ON "public"."funder_pivot_tables" USING "btree" ("portfolio_name");



CREATE INDEX "idx_funder_pivot_user" ON "public"."funder_pivot_tables" USING "btree" ("user_id");



CREATE INDEX "idx_funder_uploads_portfolio" ON "public"."funder_uploads" USING "btree" ("portfolio_name");



CREATE INDEX "idx_funder_uploads_user" ON "public"."funder_uploads" USING "btree" ("user_id");



CREATE INDEX "idx_merchants_name" ON "public"."merchants" USING "btree" ("merchant_name");



CREATE INDEX "idx_merchants_portfolio" ON "public"."merchants" USING "btree" ("portfolio_name");



CREATE INDEX "idx_merchants_user" ON "public"."merchants" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."file_versions"
    ADD CONSTRAINT "file_versions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."funder_pivot_tables"
    ADD CONSTRAINT "funder_pivot_tables_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "public"."funder_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."funder_pivot_tables"
    ADD CONSTRAINT "funder_pivot_tables_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."funder_uploads"
    ADD CONSTRAINT "funder_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_access"
    ADD CONSTRAINT "portfolio_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portfolio_access"
    ADD CONSTRAINT "portfolio_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can access files from their portfolios" ON "public"."file_versions" USING ((("user_id" = "auth"."uid"()) OR ("portfolio_name" IN ( SELECT "portfolio_access"."portfolio_name"
   FROM "public"."portfolio_access"
  WHERE ("portfolio_access"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can access funder uploads from their portfolios" ON "public"."funder_uploads" USING ((("user_id" = "auth"."uid"()) OR ("portfolio_name" IN ( SELECT "portfolio_access"."portfolio_name"
   FROM "public"."portfolio_access"
  WHERE ("portfolio_access"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can access merchants from their portfolios" ON "public"."merchants" USING ((("user_id" = "auth"."uid"()) OR ("portfolio_name" IN ( SELECT "portfolio_access"."portfolio_name"
   FROM "public"."portfolio_access"
  WHERE ("portfolio_access"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can access pivot tables from their portfolios" ON "public"."funder_pivot_tables" USING ((("user_id" = "auth"."uid"()) OR ("portfolio_name" IN ( SELECT "portfolio_access"."portfolio_name"
   FROM "public"."portfolio_access"
  WHERE ("portfolio_access"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own portfolio access" ON "public"."portfolio_access" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."file_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."funder_pivot_tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."funder_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."merchants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


















GRANT ALL ON TABLE "public"."file_versions" TO "anon";
GRANT ALL ON TABLE "public"."file_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."file_versions" TO "service_role";



GRANT ALL ON TABLE "public"."funder_pivot_tables" TO "anon";
GRANT ALL ON TABLE "public"."funder_pivot_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."funder_pivot_tables" TO "service_role";



GRANT ALL ON TABLE "public"."funder_uploads" TO "anon";
GRANT ALL ON TABLE "public"."funder_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."funder_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."merchants" TO "anon";
GRANT ALL ON TABLE "public"."merchants" TO "authenticated";
GRANT ALL ON TABLE "public"."merchants" TO "service_role";



GRANT ALL ON TABLE "public"."portfolio_access" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_access" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_access" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


