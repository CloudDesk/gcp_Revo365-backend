CREATE OR REPLACE FUNCTION public.set_epochinvoicedate()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.invoicedate IS NULL OR NEW.invoicedate <= 0 THEN
        NEW.invoicedate :=
            (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') * 1000)::BIGINT;
    END IF;

    RETURN NEW;
END;
$function$;
