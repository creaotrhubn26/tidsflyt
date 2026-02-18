import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Search, X, Filter, Calendar as CalendarIcon } from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";
import { nb } from "date-fns/locale";

export interface AdvancedFilterState {
  searchQuery: string;
  selectedFilters: Record<string, string[]>;
  dateRange: {
    from?: Date;
    to?: Date;
  };
  sortBy?: string;
}

interface FilterOption {
  id: string;
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
}

interface AdvancedSearchProps {
  placeholder?: string;
  filters: FilterOption[];
  sortOptions?: Array<{ value: string; label: string }>;
  onFilterChange: (filters: AdvancedFilterState) => void;
  onSearch: (query: string) => void;
  totalResults?: number;
}

export function AdvancedSearch({
  placeholder = "Søk...",
  filters,
  sortOptions = [],
  onFilterChange,
  onSearch,
  totalResults,
}: AdvancedSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [sortBy, setSortBy] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();

  const activeFilterCount = useMemo(() => {
    let count = Object.values(selectedFilters).reduce((sum, arr) => sum + arr.length, 0);
    if (dateRange.from || dateRange.to) count++;
    if (sortBy) count++;
    return count;
  }, [selectedFilters, dateRange, sortBy]);

  const handleFilterToggle = (filterId: string, value: string) => {
    setSelectedFilters((prev) => {
      const values = prev[filterId] || [];
      const updated = values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value];

      const newFilters: Record<string, string[]> = updated.length > 0
        ? { ...prev, [filterId]: updated }
        : { ...prev };

      // Remove undefined values
      if (updated.length === 0) {
        delete newFilters[filterId];
      }

      // Trigger change after state update
      setTimeout(() => {
        onFilterChange({
          searchQuery,
          selectedFilters: newFilters,
          dateRange,
          sortBy: sortBy || undefined,
        });
      }, 0);

      return newFilters as Record<string, string[]>;
    });
  };

  const handleDateRangeChange = (from?: Date, to?: Date) => {
    setDateRange({ from, to });
    setDateFrom(from);
    setDateTo(to);

    // Trigger change
    setTimeout(() => {
      onFilterChange({
        searchQuery,
        selectedFilters,
        dateRange: { from, to },
        sortBy: sortBy || undefined,
      });
    }, 0);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    onSearch(query);
  };

  const clearAll = () => {
    setSearchQuery("");
    setSelectedFilters({});
    setDateRange({});
    setDateFrom(undefined);
    setDateTo(undefined);
    setSortBy("");
    onFilterChange({
      searchQuery: "",
      selectedFilters: {},
      dateRange: {},
      sortBy: undefined,
    });
  };

  const quickDateRanges = [
    { label: "Siste 7 dager", days: 7 },
    { label: "Siste 30 dager", days: 30 },
    { label: "Denne måneden", special: "thisMonth" },
  ];

  return (
    <div className="space-y-4 bg-gradient-to-br from-slate-50 to-slate-100/30 dark:from-slate-900/50 dark:to-slate-800/30 rounded-lg border border-slate-200/60 dark:border-slate-700/60 p-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 pr-8"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchChange("")}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Multi-Filter Dropdown */}
        {filters.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Filter className="h-4 w-4" />
                Filtrer
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {filters.map((filter) => (
                <div key={filter.id}>
                  <DropdownMenuLabel className="text-xs font-semibold">
                    {filter.label}
                  </DropdownMenuLabel>
                  {filter.options.map((option) => (
                    <DropdownMenuCheckboxItem
                      key={option.value}
                      checked={(selectedFilters[filter.id] || []).includes(option.value)}
                      onCheckedChange={() => handleFilterToggle(filter.id, option.value)}
                      className="cursor-pointer text-sm"
                    >
                      <div className="flex items-center justify-between flex-1">
                        <span>{option.label}</span>
                        {option.count !== undefined && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({option.count})
                          </span>
                        )}
                      </div>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Date Range Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <CalendarIcon className="h-4 w-4" />
              {dateRange.from && dateRange.to ? (
                `${format(dateRange.from, "d MMM", { locale: nb })} - ${format(dateRange.to, "d MMM", { locale: nb })}`
              ) : dateRange.from ? (
                format(dateRange.from, "d MMM", { locale: nb })
              ) : (
                "Datoer"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <div className="p-4 space-y-4">
              {/* Quick Ranges */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Hurtigvalg</p>
                {quickDateRanges.map((range) => (
                  <Button
                    key={range.label}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-sm"
                    onClick={() => {
                      const to = new Date();
                      let from: Date;

                      if (range.special === "thisMonth") {
                        from = startOfMonth(new Date());
                      } else {
                        from = subDays(to, range.days || 7);
                      }

                      handleDateRangeChange(from, to);
                    }}
                  >
                    {range.label}
                  </Button>
                ))}
              </div>

              {/* Calendar Pickers */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">Fra</p>
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  disabled={(date) =>
                    dateTo ? date > dateTo : false
                  }
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">Til</p>
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  disabled={(date) =>
                    dateFrom ? date < dateFrom : false
                  }
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDateFrom(undefined);
                    setDateTo(undefined);
                    handleDateRangeChange(undefined, undefined);
                  }}
                >
                  Nullstill
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    handleDateRangeChange(dateFrom, dateTo);
                  }}
                >
                  Bruk
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort Dropdown */}
        {sortOptions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Sortering: {sortOptions.find(o => o.value === sortBy)?.label || "Standard"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {sortOptions.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={sortBy === option.value}
                  onCheckedChange={() => {
                    setSortBy(option.value);
                    setTimeout(() => {
                      onFilterChange({
                        searchQuery,
                        selectedFilters,
                        dateRange,
                        sortBy: option.value,
                      });
                    }, 0);
                  }}
                  className="cursor-pointer"
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Clear All */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
            Nullstill alt
          </Button>
        )}

        {/* Results Count */}
        {totalResults !== undefined && (
          <div className="ml-auto text-sm text-muted-foreground">
            {totalResults} resultat{totalResults !== 1 ? "er" : ""}
          </div>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(selectedFilters).map(([filterId, values]) =>
            values.map((value) => {
              const filter = filters.find((f) => f.id === filterId);
              const option = filter?.options.find((o) => o.value === value);
              return (
                <Badge
                  key={`${filterId}-${value}`}
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => handleFilterToggle(filterId, value)}
                >
                  {option?.label}
                  <X className="h-3 w-3" />
                </Badge>
              );
            })
          )}
          {dateRange.from && dateRange.to && (
            <Badge
              variant="secondary"
              className="gap-1 cursor-pointer hover:bg-secondary/80"
              onClick={() => handleDateRangeChange(undefined, undefined)}
            >
              {format(dateRange.from, "d MMM", { locale: nb })} -{" "}
              {format(dateRange.to, "d MMM", { locale: nb })}
              <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
