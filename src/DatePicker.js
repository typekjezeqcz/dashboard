const DateSelector = ({ setStartDate, setEndDate }) => {
  const setToday = () => {
    const today = new Date();
    setStartDate(today);
    setEndDate(today);
  };

  const setYesterday = () => {
    const yesterday = new Date(new Date().setDate(new Date().getDate() - 1));
    setStartDate(yesterday);
    setEndDate(yesterday);
  };

  const setThisWeek = () => {
    const today = new Date();
    const firstDayOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
    setStartDate(firstDayOfWeek);
    setEndDate(new Date()); // Today's date
  };

  const handleSelectChange = (event) => {
    switch (event.target.value) {
      case 'today':
        setToday();
        break;
      case 'yesterday':
        setYesterday();
        break;
      case 'thisWeek':
        setThisWeek();
        break;
      default:
        break;
    }
  };
  return (
    <div className="relative w-64">
      <select
        onChange={handleSelectChange}
        className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2 pr-8 rounded-lg shadow leading-tight focus:outline-none focus:ring-blue-300 focus:border-blue-300"
      >
        <option value="">Select Date Range</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="thisWeek">This Week</option>
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M5.3 7.7L10 12.4l4.7-4.7 1.4 1.4-6.1 6.1-6.1-6.1z"/>
        </svg>
      </div>
    </div>
  );
};

export default DateSelector;
